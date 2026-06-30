import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { IncidentType, Severity, IncidentStatus, AlertType, WantedStatus } from '@prisma/client';

@Injectable()
export class SafeAiService {
  private readonly logger = new Logger(SafeAiService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Public: Report an incident ─────────────────────────────────────────────

  async reportIncident(dto: {
    reporterId?: string;
    incidentType: IncidentType;
    description: string;
    latitude: number;
    longitude: number;
    address?: string;
    city?: string;
    state?: string;
    severity?: Severity;
    incidentDate?: Date;
    evidenceUrls?: string[];
    witnesses?: any;
    isAnonymous?: boolean;
    reporterContact?: string;
  }) {
    const incident = await this.prisma.incident.create({
      data: {
        ...dto,
        evidenceUrls: dto.evidenceUrls ?? [],
        isAnonymous: dto.isAnonymous ?? false,
        priorityScore: this.calcPriority(dto.severity ?? Severity.MEDIUM),
      },
    });

    this.logger.log(`Incident ${incident.id} reported (${incident.incidentType})`);
    return incident;
  }

  // ── Public: Browse incidents ───────────────────────────────────────────────

  async getIncidents(query: {
    city?: string;
    state?: string;
    incidentType?: IncidentType;
    severity?: Severity;
    status?: IncidentStatus;
    page?: number;
    limit?: number;
  }) {
    const { city, state, incidentType, severity, status, page = 1, limit = 20 } = query;
    const where: any = {};
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (state) where.state = { contains: state, mode: 'insensitive' };
    if (incidentType) where.incidentType = incidentType;
    if (severity) where.severity = severity;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.incident.findMany({
        where,
        orderBy: { reportedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          incidentType: true,
          description: true,
          latitude: true,
          longitude: true,
          address: true,
          city: true,
          state: true,
          severity: true,
          status: true,
          priorityScore: true,
          incidentDate: true,
          reportedAt: true,
          isAnonymous: true,
          evidenceUrls: true,
        },
      }),
      this.prisma.incident.count({ where }),
    ]);

    return { items, total, page, pageSize: limit, hasMore: page * limit < total };
  }

  async getIncidentById(id: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: { updates: { orderBy: { createdAt: 'asc' } }, verifications: true },
    });
    if (!incident) throw new NotFoundException('Incident not found.');
    return incident;
  }

  // ── Public: Nearby hotspots ────────────────────────────────────────────────

  async getNearbyHotspots(lat: number, lng: number, radiusKm = 10) {
    // Bounding-box approximation (1° ≈ 111 km)
    const delta = radiusKm / 111;
    return this.prisma.crimeHotspot.findMany({
      where: {
        latitude: { gte: lat - delta, lte: lat + delta },
        longitude: { gte: lng - delta, lte: lng + delta },
      },
      orderBy: { riskScore: 'desc' },
      take: 20,
    });
  }

  // ── Public: Active safety alerts ──────────────────────────────────────────

  async getActiveAlerts(query: { city?: string; alertType?: AlertType; page?: number; limit?: number }) {
    const { city, alertType, page = 1, limit = 20 } = query;
    const where: any = {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    };
    if (alertType) where.alertType = alertType;

    const [items, total] = await Promise.all([
      this.prisma.safetyAlert.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.safetyAlert.count({ where }),
    ]);

    return { items, total, page, pageSize: limit, hasMore: page * limit < total };
  }

  // ── Public: Wanted persons ─────────────────────────────────────────────────

  async getWantedPersons(query: { status?: WantedStatus; page?: number; limit?: number }) {
    const { status = WantedStatus.ACTIVE, page = 1, limit = 20 } = query;

    const [items, total] = await Promise.all([
      this.prisma.wantedPerson.findMany({
        where: { status },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.wantedPerson.count({ where: { status } }),
    ]);

    // Increment view counts in background
    await this.prisma.wantedPerson.updateMany({
      where: { status },
      data: { viewCount: { increment: 1 } },
    });

    return { items, total, page, pageSize: limit, hasMore: page * limit < total };
  }

  // ── Public: Police stations ────────────────────────────────────────────────

  async getPoliceStations(query: { city?: string; state?: string }) {
    const { city, state } = query;
    const where: any = { isOperational: true };
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (state) where.state = { contains: state, mode: 'insensitive' };
    return this.prisma.policeStation.findMany({ where, orderBy: { name: 'asc' } });
  }

  // ── Public: Emergency response ─────────────────────────────────────────────

  async callEmergency(dto: {
    emergencyType: any;
    description: string;
    latitude: number;
    longitude: number;
    address?: string;
    callerPhone?: string;
    callerName?: string;
    priority?: number;
  }) {
    const response = await this.prisma.emergencyResponse.create({
      data: {
        ...dto,
        priority: dto.priority ?? 3,
        dispatchedOfficers: [],
        status: 'PENDING',
      },
    });
    this.logger.warn(`Emergency response ${response.id} created (${response.emergencyType})`);
    return response;
  }

  // ── Admin: Update incident status ──────────────────────────────────────────

  async updateIncidentStatus(
    incidentId: string,
    officerId: string,
    dto: { status: IncidentStatus; notes?: string; assignedOfficerId?: string },
  ) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException('Incident not found.');

    const [updated] = await Promise.all([
      this.prisma.incident.update({
        where: { id: incidentId },
        data: {
          status: dto.status,
          assignedOfficerId: dto.assignedOfficerId ?? incident.assignedOfficerId,
          officerNotes: dto.notes ?? incident.officerNotes,
          resolvedAt: dto.status === 'RESOLVED' || dto.status === 'CLOSED' ? new Date() : incident.resolvedAt,
        },
      }),
      this.prisma.incidentUpdate.create({
        data: {
          incidentId,
          updateType: dto.assignedOfficerId ? 'ASSIGNMENT' : 'STATUS_CHANGE',
          message: dto.notes ?? `Status changed to ${dto.status}`,
          updatedBy: officerId,
          updatedByRole: 'officer',
          attachments: [],
        },
      }),
    ]);

    return updated;
  }

  // ── Admin: Verify incident ─────────────────────────────────────────────────

  async verifyIncident(incidentId: string, verifierId: string, dto: {
    isVerified: boolean;
    confidence: number;
    notes?: string;
    evidenceUrls?: string[];
  }) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException('Incident not found.');

    const [verification] = await Promise.all([
      this.prisma.incidentVerification.create({
        data: {
          incidentId,
          verifiedBy: verifierId,
          isVerified: dto.isVerified,
          confidence: dto.confidence,
          notes: dto.notes,
          evidenceUrls: dto.evidenceUrls ?? [],
        },
      }),
      dto.isVerified
        ? this.prisma.incident.update({ where: { id: incidentId }, data: { status: 'VERIFIED' } })
        : Promise.resolve(),
    ]);

    return verification;
  }

  // ── Admin: Publish safety alert ────────────────────────────────────────────

  async publishAlert(issuerId: string, issuerRole: string, dto: {
    alertType: AlertType;
    title: string;
    message: string;
    severity: Severity;
    targetAreas?: any;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    expiresAt?: Date;
  }) {
    return this.prisma.safetyAlert.create({
      data: { ...dto, issuedBy: issuerId, issuedByRole: issuerRole },
    });
  }

  async deactivateAlert(id: string) {
    const alert = await this.prisma.safetyAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found.');
    return this.prisma.safetyAlert.update({ where: { id }, data: { isActive: false } });
  }

  // ── Admin: Wanted persons CRUD ─────────────────────────────────────────────

  async createWantedPerson(dto: {
    name: string;
    alias?: string[];
    age?: number;
    gender?: any;
    height?: string;
    weight?: string;
    complexion?: string;
    charges: string[];
    description: string;
    photoUrls?: string[];
    lastSeenLocation?: string;
    lastSeenDate?: Date;
    priority: number;
    rewardAmount?: number;
    tiplinePhone?: string;
  }) {
    return this.prisma.wantedPerson.create({
      data: {
        ...dto,
        alias: dto.alias ?? [],
        photoUrls: dto.photoUrls ?? [],
        charges: dto.charges,
      },
    });
  }

  async updateWantedPersonStatus(id: string, status: WantedStatus) {
    const person = await this.prisma.wantedPerson.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('Wanted person record not found.');
    return this.prisma.wantedPerson.update({ where: { id }, data: { status } });
  }

  // ── Admin: Stats ───────────────────────────────────────────────────────────

  async getAdminStats() {
    const [
      incidentsByStatus,
      incidentsByType,
      activeAlerts,
      openEmergencies,
      wantedActive,
    ] = await Promise.all([
      this.prisma.incident.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.incident.groupBy({ by: ['incidentType'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 10 }),
      this.prisma.safetyAlert.count({ where: { isActive: true } }),
      this.prisma.emergencyResponse.count({ where: { status: { in: ['PENDING', 'DISPATCHED', 'EN_ROUTE'] } } }),
      this.prisma.wantedPerson.count({ where: { status: 'ACTIVE' } }),
    ]);

    return {
      incidentsByStatus: Object.fromEntries(incidentsByStatus.map(r => [r.status, r._count.id])),
      topIncidentTypes: incidentsByType.map(r => ({ type: r.incidentType, count: r._count.id })),
      activeAlerts,
      openEmergencies,
      wantedActive,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private calcPriority(severity: Severity): number {
    const map: Record<Severity, number> = {
      LOW: 20,
      MEDIUM: 50,
      HIGH: 70,
      CRITICAL: 90,
      EMERGENCY: 100,
    };
    return map[severity] ?? 50;
  }
}
