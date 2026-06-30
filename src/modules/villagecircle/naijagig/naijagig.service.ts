import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { Gig } from './gig.schema';

@Injectable()
export class NaijaGigService {
  private readonly logger = new Logger(NaijaGigService.name);

  async createGig(clientId: string, dto: any) {
    const gig = await Gig.create({ clientId, ...dto });
    this.logger.log(`Gig "${gig.title}" created by client ${clientId}`);
    return gig;
  }

  async listGigs(query: {
    category?: string;
    city?: string;
    state?: string;
    status?: string;
    urgency?: string;
    page?: number;
    limit?: number;
  }) {
    const { category, city, state, status = 'open', urgency, page = 1, limit = 20 } = query;
    const filter: any = { 'visibility.isPublic': true, status };
    if (category) filter.category = category;
    if (city) filter['location.city'] = new RegExp(city, 'i');
    if (state) filter['location.state'] = new RegExp(state, 'i');
    if (urgency) filter.urgency = urgency;

    const [items, total] = await Promise.all([
      Gig.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Gig.countDocuments(filter),
    ]);

    return { items, total, page, pageSize: limit, hasMore: page * limit < total };
  }

  async getGigById(id: string) {
    const gig = await Gig.findById(id).lean();
    if (!gig) throw new NotFoundException('Gig not found');
    return gig;
  }

  async getMyGigs(clientId: string, page = 1, limit = 20) {
    const [items, total] = await Promise.all([
      Gig.find({ clientId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Gig.countDocuments({ clientId }),
    ]);
    return { items, total, page, pageSize: limit };
  }

  async updateGig(clientId: string, id: string, dto: any) {
    const gig = await Gig.findOneAndUpdate(
      { _id: id, clientId },
      { $set: dto },
      { new: true },
    ).lean();
    if (!gig) throw new NotFoundException('Gig not found or not yours');
    return gig;
  }

  async deleteGig(clientId: string, id: string) {
    const result = await Gig.deleteOne({ _id: id, clientId });
    if (result.deletedCount === 0) throw new NotFoundException('Gig not found');
    return { deleted: true };
  }

  async applyToGig(artisanId: string, gigId: string, dto: {
    message: string;
    bidAmount: number;
    estimatedTime: string;
    portfolioItems?: string[];
  }) {
    const gig = await Gig.findById(gigId);
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.status !== 'open') throw new ForbiddenException('This gig is no longer accepting applications');

    const alreadyApplied = gig.applications.some(a => a.artisanId === artisanId);
    if (alreadyApplied) throw new ForbiddenException('You have already applied to this gig');

    gig.applications.push({
      artisanId,
      message: dto.message,
      bidAmount: dto.bidAmount,
      estimatedTime: dto.estimatedTime,
      portfolioItems: dto.portfolioItems ?? [],
      status: 'pending',
      appliedAt: new Date(),
    });

    await gig.save();
    this.logger.log(`Artisan ${artisanId} applied to gig ${gigId}`);
    return { success: true, applicationCount: gig.applications.length };
  }

  async updateApplicationStatus(
    clientId: string,
    gigId: string,
    artisanId: string,
    status: 'shortlisted' | 'rejected' | 'hired',
  ) {
    const gig = await Gig.findOne({ _id: gigId, clientId });
    if (!gig) throw new NotFoundException('Gig not found');

    const app = gig.applications.find(a => a.artisanId === artisanId);
    if (!app) throw new NotFoundException('Application not found');

    app.status = status;

    if (status === 'hired') {
      gig.status = 'in_progress';
      gig.hiredArtisan = { id: artisanId, hiredAt: new Date() };
    }

    await gig.save();
    return { success: true, status };
  }

  async getCategories() {
    return ['plumbing', 'electrical', 'carpentry', 'tailoring', 'makeup', 'catering', 'cleaning', 'repairs'];
  }
}
