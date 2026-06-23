import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "../../../database/prisma.service";
import { RedisService } from "../../../database/redis.service";
import { AiService } from "../../ai/ai.service";
import { CreateEmployeeDto, RunPayrollDto } from "../dto/all-planai.dto";
import { NG_PAYE_BANDS, NG_PENSION_RATE, NG_NHF_RATE } from "../planai.types";

@Injectable()
export class HRPayrollService {
  private readonly logger = new Logger(HRPayrollService.name);

  // Salary disbursement via Paystack Bulk Transfer
  private readonly paystackSecretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.paystackSecretKey = this.config.get<string>("PAYSTACK_SECRET_KEY", "");
  }

  // ─── Employee management ─────────────────────────────────────────────────────

  async createEmployee(userId: string, dto: CreateEmployeeDto) {
    const empId = `emp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const deductions = this.computeDeductions(dto.monthlySalaryNGN);

    await this.prisma.activityLog.create({
      data: {
        userId,
        action: "hr.employee_created",
        productSlug: "hr-payroll",
        metadata: {
          empId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          role: dto.role,
          department: dto.department ?? null,
          monthlySalaryNGN: dto.monthlySalaryNGN,
          bankName: dto.bankName ?? null,
          accountNumber: dto.accountNumber ?? null,
          pfaCode: dto.pfaCode ?? null,
          startDate: dto.startDate ?? new Date().toISOString(),
          status: "active",
        },
      },
    });

    return {
      id: empId,
      fullName: `${dto.firstName} ${dto.lastName}`,
      email: dto.email,
      role: dto.role,
      department: dto.department,
      grossSalaryNGN: dto.monthlySalaryNGN,
      netSalaryNGN: dto.monthlySalaryNGN - deductions.total,
      deductions,
      startDate: dto.startDate ?? new Date().toISOString(),
    };
  }

  async getEmployees(userId: string) {
    const logs = await this.prisma.activityLog.findMany({
      where: { userId, action: "hr.employee_created" },
      orderBy: { createdAt: "desc" },
    });
    return logs
      .map((l) => ({
        ...(l.metadata as Record<string, unknown>),
        createdAt: l.createdAt,
      }))
      .filter((e) => e["status"] !== "terminated");
  }

  async terminateEmployee(userId: string, empId: string) {
    // Mark as terminated in logs
    await this.prisma.activityLog.create({
      data: {
        userId,
        action: "hr.employee_terminated",
        productSlug: "hr-payroll",
        metadata: { empId, terminatedAt: new Date().toISOString() },
      },
    });
    return {
      empId,
      status: "terminated",
      message: "Employee offboarded. Generate final payslip in payroll.",
    };
  }

  // ─── Payroll processing ───────────────────────────────────────────────────────

  async runPayroll(userId: string, dto: RunPayrollDto) {
    const employees = await this.getEmployees(userId);
    const targets = dto.employeeIds?.length
      ? employees.filter((e) => dto.employeeIds!.includes(e["empId"] as string))
      : employees;

    if (targets.length === 0) {
      return {
        error:
          "No active employees found. Add employees before running payroll.",
      };
    }

    const payslips = targets.map((emp) => {
      const gross = (emp["monthlySalaryNGN"] as number) ?? 0;
      const deductions = this.computeDeductions(gross);
      return {
        empId: emp["empId"],
        fullName: `${emp["firstName"]} ${emp["lastName"]}`,
        email: emp["email"],
        phone: emp["phone"] ?? null,
        bankName: emp["bankName"] ?? null,
        accountNumber: emp["accountNumber"] ?? null,
        month: dto.month,
        year: dto.year,
        grossNGN: gross,
        deductions,
        netNGN: gross - deductions.total,
        status: "processed",
      };
    });

    const totalGross = payslips.reduce((s, p) => s + p.grossNGN, 0);
    const totalNet = payslips.reduce((s, p) => s + p.netNGN, 0);
    const totalDeductions = payslips.reduce(
      (s, p) => s + p.deductions.total,
      0,
    );

    await this.prisma.activityLog.create({
      data: {
        userId,
        action: "hr.payroll_run",
        productSlug: "hr-payroll",
        metadata: {
          month: dto.month,
          year: dto.year,
          employeeCount: payslips.length,
          totalGross,
          totalNet,
        },
      },
    });

    // Optional: bulk salary disbursement via Paystack
    let disbursementResult: Record<string, unknown> | null = null;
    if (
      this.paystackSecretKey &&
      payslips.every((p) => p.accountNumber && p.bankName)
    ) {
      disbursementResult = await this.initiatePaystackBulkTransfer(
        payslips,
      ).catch((err) => {
        this.logger.warn(`Paystack bulk transfer failed: ${String(err)}`);
        return {
          error: String(err),
          message:
            "Disbursement failed — process manually via bank upload file.",
        };
      });
    }

    // Generate bank upload file if requested
    let bankFile: string | null = null;
    if (dto.generateBankFile) {
      bankFile = this.generateBankUploadCsv(payslips);
    }

    return {
      period: `${this.monthName(dto.month)} ${dto.year}`,
      employeeCount: payslips.length,
      summary: {
        totalGrossNGN: totalGross,
        totalDeductionsNGN: totalDeductions,
        totalNetNGN: totalNet,
        payeCollectedNGN: payslips.reduce((s, p) => s + p.deductions.paye, 0),
        pensionCollectedNGN: payslips.reduce(
          (s, p) => s + p.deductions.pension,
          0,
        ),
      },
      payslips,
      disbursement: disbursementResult,
      bankFile,
      deliverPayslips: dto.deliverPayslips ?? true,
    };
  }

  // ─── Leave management ─────────────────────────────────────────────────────────

  async requestLeave(
    userId: string,
    input: {
      empId: string;
      leaveType: "annual" | "sick" | "maternity" | "paternity" | "unpaid";
      startDate: string;
      endDate: string;
      reason?: string;
    },
  ) {
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400_000) + 1;

    const requestId = `leave_${Date.now().toString(36)}`;
    await this.prisma.activityLog.create({
      data: {
        userId,
        action: "hr.leave_requested",
        productSlug: "hr-payroll",
        metadata: { requestId, ...input, days, status: "pending" },
      },
    });

    return {
      requestId,
      empId: input.empId,
      leaveType: input.leaveType,
      days,
      status: "pending",
    };
  }

  async getLeaveBalance(userId: string, empId: string) {
    const leaveRequests = await this.prisma.activityLog.findMany({
      where: {
        userId,
        action: "hr.leave_requested",
        metadata: { path: ["empId"], equals: empId },
      },
      select: { metadata: true },
    });

    const taken = leaveRequests.reduce(
      (acc, l) => {
        const m = l.metadata as Record<string, unknown>;
        const type = (m.leaveType as string) ?? "annual";
        const days = (m.days as number) ?? 0;
        acc[type] = (acc[type] ?? 0) + days;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      empId,
      annual: {
        entitled: 21,
        taken: taken["annual"] ?? 0,
        remaining: 21 - (taken["annual"] ?? 0),
      },
      sick: {
        entitled: 10,
        taken: taken["sick"] ?? 0,
        remaining: 10 - (taken["sick"] ?? 0),
      },
      maternity: {
        entitled: 84,
        taken: taken["maternity"] ?? 0,
        remaining: 84 - (taken["maternity"] ?? 0),
      },
      paternity: {
        entitled: 14,
        taken: taken["paternity"] ?? 0,
        remaining: 14 - (taken["paternity"] ?? 0),
      },
    };
  }

  // ─── AI tools ────────────────────────────────────────────────────────────────

  async generateJobDescription(
    userId: string,
    input: { role: string; department: string; salaryRangeNGN?: string },
  ) {
    const result = await this.ai.generateJson<{
      title: string;
      summary: string;
      responsibilities: string[];
      requirements: string[];
      niceToHave: string[];
      salaryRange: string;
      benefits: string[];
    }>(
      "You are a Nigerian HR professional. Write job descriptions for the Nigerian market. Valid JSON only.",
      `Generate a professional job description for a Nigerian company.
Role: ${input.role}, Department: ${input.department}
Salary range: ${input.salaryRangeNGN ?? "competitive"}

Return JSON: { title, summary (2-sentence role overview), responsibilities: [7 items], 
requirements: [6 items], niceToHave: [3 items], salaryRange, benefits: [5 Nigerian-relevant benefits] }`,
      { task: "creative", temperature: 0.6 },
    );

    await this.logActivity(userId, "hr.jd_generated", { role: input.role });
    return result.content;
  }

  async generateQueryLetter(
    userId: string,
    input: {
      employeeName: string;
      offence: string;
      incidentDate: string;
      details: string;
    },
  ) {
    const result = await this.ai.generateJson<{
      subject: string;
      body: string;
    }>(
      "You are a Nigerian HR officer. Write formal HR letters compliant with Nigerian Labour Act. Valid JSON only.",
      `Write a formal query letter to an employee.
Employee: ${input.employeeName}, Offence: ${input.offence}
Incident date: ${input.incidentDate}, Details: ${input.details}

Return JSON: { subject (formal subject line), body (full formal letter text, HTML formatted) }
Reference Nigerian Labour Act 2004 where appropriate. Give 5 working days to respond.`,
      { task: "reasoning", temperature: 0.4 },
    );

    await this.logActivity(userId, "hr.query_letter_generated", {
      employeeName: input.employeeName,
    });
    return result.content;
  }

  // ─── PAYE computation engine ─────────────────────────────────────────────────

  computeDeductions(grossMonthlyNGN: number) {
    const grossAnnual = grossMonthlyNGN * 12;

    // Employee pension: 8% of gross
    const pensionMonthly = Math.round(grossMonthlyNGN * NG_PENSION_RATE);

    // NHF: 2.5% of basic (approximated as 60% of gross)
    const basicSalary = grossMonthlyNGN * 0.6;
    const nhfMonthly = Math.round(basicSalary * NG_NHF_RATE);

    // PAYE — graduated annual, then ÷ 12
    // Consolidated Relief Allowance: higher of ₦200k or 1% of gross annual, plus 20% of gross annual
    const cra = Math.max(200_000, grossAnnual * 0.01) + grossAnnual * 0.2;
    const taxableAnnual = Math.max(0, grossAnnual - cra - pensionMonthly * 12);

    let paye = 0;
    let remaining = taxableAnnual;
    let prevLimit = 0;
    for (const band of NG_PAYE_BANDS) {
      const bandAmount = Math.min(remaining, band.limit - prevLimit);
      if (bandAmount <= 0) break;
      paye += bandAmount * band.rate;
      remaining -= bandAmount;
      prevLimit = band.limit;
      if (remaining <= 0) break;
    }
    const payeMonthly = Math.round(paye / 12);

    const total = payeMonthly + pensionMonthly + nhfMonthly;

    return {
      paye: payeMonthly,
      pension: pensionMonthly,
      nhf: nhfMonthly,
      total,
      effectiveRatePercent:
        grossMonthlyNGN > 0
          ? Math.round((total / grossMonthlyNGN) * 100 * 10) / 10
          : 0,
    };
  }

  // ─── Paystack bulk transfer ───────────────────────────────────────────────────

  private async initiatePaystackBulkTransfer(
    payslips: Array<{
      accountNumber: string | null;
      bankName: string | null;
      netNGN: number;
      fullName: string;
      empId: unknown;
    }>,
  ) {
    // Step 1: Create transfer recipients
    const transfers = await Promise.all(
      payslips.map(async (p) => {
        const bankCode = await this.getBankCode(p.bankName ?? "");
        if (!bankCode) return null;

        const { data: recipient } = await firstValueFrom(
          this.http.post(
            "https://api.paystack.co/transferrecipient",
            {
              type: "nuban",
              name: p.fullName,
              account_number: p.accountNumber,
              bank_code: bankCode,
              currency: "NGN",
            },
            { headers: { Authorization: `Bearer ${this.paystackSecretKey}` } },
          ),
        );

        return {
          amount: p.netNGN * 100, // kobo
          reference: `payroll_${p.empId}_${Date.now()}`,
          reason: `Salary payment`,
          recipient: (recipient as { data: { recipient_code: string } }).data
            .recipient_code,
        };
      }),
    );

    const validTransfers = transfers.filter(Boolean);
    if (validTransfers.length === 0) {
      return {
        initiated: 0,
        message: "No valid bank accounts found for transfer.",
      };
    }

    // Step 2: Initiate bulk transfer
    const { data } = await firstValueFrom(
      this.http.post(
        "https://api.paystack.co/transfer/bulk",
        { currency: "NGN", source: "balance", transfers: validTransfers },
        { headers: { Authorization: `Bearer ${this.paystackSecretKey}` } },
      ),
    );

    return { initiated: validTransfers.length, paystackResponse: data };
  }

  private async getBankCode(bankName: string): Promise<string | null> {
    const bankCodes: Record<string, string> = {
      "access bank": "044",
      gtbank: "058",
      gtco: "058",
      "zenith bank": "057",
      "first bank": "011",
      uba: "033",
      "union bank": "032",
      stanbic: "221",
      "sterling bank": "232",
      "fidelity bank": "070",
      fcmb: "214",
      "wema bank": "035",
      "keystone bank": "082",
      "polaris bank": "076",
      ecobank: "050",
      "kuda bank": "090267",
      opay: "999992",
      palmpay: "999991",
    };
    const key = bankName.toLowerCase().trim();
    return bankCodes[key] ?? null;
  }

  private generateBankUploadCsv(
    payslips: Array<{
      fullName: string;
      accountNumber: string | null;
      bankName: string | null;
      netNGN: number;
    }>,
  ): string {
    const header = "Employee Name,Account Number,Bank Name,Net Salary (NGN)";
    const rows = payslips
      .map(
        (p) =>
          `${p.fullName},${p.accountNumber ?? ""},${p.bankName ?? ""},${p.netNGN}`,
      )
      .join("\n");
    return `${header}\n${rows}`;
  }

  private monthName(month: number): string {
    return new Date(2024, month - 1, 1).toLocaleString("en-NG", {
      month: "long",
    });
  }

  private async logActivity(
    userId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.activityLog
      .create({
        data: {
          userId,
          action,
          productSlug: "hr-payroll",
          metadata: { ...metadata, timestamp: new Date().toISOString() },
        },
      })
      .catch(() => {});
  }
}
