import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Receipt } from './receipt.schema';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ReceiptGeniusService {
  private readonly logger = new Logger(ReceiptGeniusService.name);

  async createReceipt(userId: string, dto: any) {
    const receiptNumber = `RG-${uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    const receipt = await Receipt.create({
      userId,
      receiptNumber,
      ...dto,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
    });
    this.logger.log(`Receipt ${receiptNumber} created for user ${userId}`);
    return receipt;
  }

  async getReceipts(userId: string, query: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = query;
    const filter: any = { userId };
    if (status) filter.status = status;

    const [items, total] = await Promise.all([
      Receipt.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Receipt.countDocuments(filter),
    ]);

    return { items, total, page, pageSize: limit, hasMore: page * limit < total };
  }

  async getReceiptById(userId: string, id: string) {
    const receipt = await Receipt.findOne({ _id: id, userId }).lean();
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }

  async updateReceipt(userId: string, id: string, dto: any) {
    const receipt = await Receipt.findOneAndUpdate(
      { _id: id, userId },
      { $set: dto },
      { new: true },
    ).lean();
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }

  async deleteReceipt(userId: string, id: string) {
    const result = await Receipt.deleteOne({ _id: id, userId });
    if (result.deletedCount === 0) throw new NotFoundException('Receipt not found');
    return { deleted: true };
  }

  async getStats(userId: string) {
    const [total, paid, pending, overdue] = await Promise.all([
      Receipt.countDocuments({ userId }),
      Receipt.countDocuments({ userId, status: 'paid' }),
      Receipt.countDocuments({ userId, status: 'sent', paymentStatus: 'pending' }),
      Receipt.countDocuments({ userId, status: 'overdue' }),
    ]);

    const revenueResult = await Receipt.aggregate([
      { $match: { userId, paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);

    return {
      total,
      paid,
      pending,
      overdue,
      totalRevenue: revenueResult[0]?.total ?? 0,
    };
  }
}
