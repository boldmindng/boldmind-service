import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ProduceListing } from './produce-listing.schema';

@Injectable()
export class FarmgateService {
  private readonly logger = new Logger(FarmgateService.name);

  async createListing(farmerId: string, dto: any) {
    const listing = await ProduceListing.create({ farmerId, ...dto });
    this.logger.log(`Produce listing "${listing.productName}" created by farmer ${farmerId}`);
    return listing;
  }

  async browseProduce(query: {
    category?: string;
    city?: string;
    state?: string;
    organic?: boolean;
    maxPrice?: number;
    page?: number;
    limit?: number;
  }) {
    const { category, city, state, organic, maxPrice, page = 1, limit = 20 } = query;

    const filter: any = { status: 'available' };
    if (category) filter.category = category;
    if (city) filter['location.city'] = new RegExp(city, 'i');
    if (state) filter['location.state'] = new RegExp(state, 'i');
    if (organic === true) filter['quality.organic'] = true;
    if (maxPrice) filter['pricing.pricePerUnit'] = { $lte: maxPrice };

    const [items, total] = await Promise.all([
      ProduceListing.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ProduceListing.countDocuments(filter),
    ]);

    return { items, total, page, pageSize: limit, hasMore: page * limit < total };
  }

  async getListingById(id: string) {
    const listing = await ProduceListing.findById(id).lean();
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  async getMyListings(farmerId: string, page = 1, limit = 20) {
    const [items, total] = await Promise.all([
      ProduceListing.find({ farmerId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ProduceListing.countDocuments({ farmerId }),
    ]);
    return { items, total, page, pageSize: limit };
  }

  async updateListing(farmerId: string, id: string, dto: any) {
    const listing = await ProduceListing.findOneAndUpdate(
      { _id: id, farmerId },
      { $set: dto },
      { new: true },
    ).lean();
    if (!listing) throw new NotFoundException('Listing not found or not yours');
    return listing;
  }

  async deleteListing(farmerId: string, id: string) {
    const result = await ProduceListing.deleteOne({ _id: id, farmerId });
    if (result.deletedCount === 0) throw new NotFoundException('Listing not found');
    return { deleted: true };
  }

  async placeBuyerOrder(buyerId: string, listingId: string, quantity: number) {
    const listing = await ProduceListing.findById(listingId);
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'available') throw new BadRequestException('Produce not available');
    if (quantity > listing.quantity.available) {
      throw new BadRequestException(`Only ${listing.quantity.available} ${listing.quantity.unit} available`);
    }

    listing.orders.push({ buyerId, quantity, status: 'pending', orderedAt: new Date() });
    listing.quantity.available -= quantity;
    if (listing.quantity.available === 0) listing.status = 'reserved';
    await listing.save();

    this.logger.log(`Order placed on listing ${listingId} by buyer ${buyerId}`);
    return { success: true, remaining: listing.quantity.available };
  }

  async getCategories() {
    return ['grains', 'tubers', 'vegetables', 'fruits', 'livestock', 'dairy', 'poultry'];
  }
}
