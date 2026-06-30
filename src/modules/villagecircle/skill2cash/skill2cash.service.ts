import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { VideoProfile } from './video-profile.schema';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class Skill2CashService {
  private readonly logger = new Logger(Skill2CashService.name);

  async createProfile(userId: string, dto: any) {
    const existing = await VideoProfile.findOne({ userId });
    if (existing) {
      return this.updateProfile(userId, existing._id.toString(), dto);
    }

    const profile = await VideoProfile.create({
      userId,
      isAnonymous: false,
      ...dto,
    });

    this.logger.log(`Skill2Cash profile created for user ${userId}`);
    return profile;
  }

  async getMyProfile(userId: string) {
    const profile = await VideoProfile.findOne({ userId }).lean();
    if (!profile) throw new NotFoundException('Profile not found. Create your video profile to get started.');
    return profile;
  }

  async browseProfiles(query: {
    skill?: string;
    category?: string;
    location?: string;
    available?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { skill, category, location, available, page = 1, limit = 20 } = query;

    const filter: any = { isActive: true };
    if (skill) filter['skills.name'] = new RegExp(skill, 'i');
    if (category) filter['skills.category'] = new RegExp(category, 'i');
    if (location) filter['preferences.locations'] = new RegExp(location, 'i');
    if (available !== undefined) filter['availability.status'] = available ? 'available' : { $ne: 'available' };

    const [items, total] = await Promise.all([
      VideoProfile.find(filter)
        .select('-userId -verification.identityVerified')
        .sort({ 'stats.avgRating': -1, 'stats.completedGigs': -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      VideoProfile.countDocuments(filter),
    ]);

    return { items, total, page, pageSize: limit, hasMore: page * limit < total };
  }

  async getProfileById(id: string) {
    const profile = await VideoProfile.findById(id)
      .select('-userId -verification.identityVerified')
      .lean();
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async updateProfile(userId: string, id: string, dto: any) {
    const profile = await VideoProfile.findOneAndUpdate(
      { _id: id, userId },
      { $set: { ...dto, lastActive: new Date() } },
      { new: true },
    ).lean();
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async setAvailability(userId: string, status: 'available' | 'busy' | 'unavailable') {
    await VideoProfile.updateOne(
      { userId },
      { $set: { 'availability.status': status, lastActive: new Date() } },
    );
    return { status };
  }

  async createAnonymousProfile(dto: any) {
    const anonymousId = `anon_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const profile = await VideoProfile.create({
      isAnonymous: true,
      anonymousId,
      ...dto,
    });
    this.logger.log(`Anonymous Skill2Cash profile created: ${anonymousId}`);
    return { anonymousId, profileId: profile._id };
  }
}
