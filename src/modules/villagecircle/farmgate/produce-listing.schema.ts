import mongoose, { Schema, Document } from 'mongoose';

export interface IProduceListing extends Document {
    farmerId: string;
    productName: string;
    category: 'grains' | 'tubers' | 'vegetables' | 'fruits' | 'livestock' | 'dairy' | 'poultry';
    variety: string;
    quantity: { amount: number; unit: 'kg' | 'g' | 'liters' | 'pieces' | 'bags'; available: number };
    quality: { grade: 'A' | 'B' | 'C'; organic: boolean; certifications: string[]; images: string[]; description: string };
    pricing: {
        pricePerUnit: number;
        currency: string;
        minOrder: number;
        bulkDiscount?: { minQuantity: number; discountPercent: number };
    };
    location: {
        farmAddress: string;
        coordinates: [number, number];
        city: string;
        state: string;
        pickupAvailable: boolean;
        deliveryRadius: number;
    };
    harvestDate: Date;
    shelfLife: number;
    status: 'available' | 'reserved' | 'sold' | 'harvested' | 'expired';
    orders: Array<{ buyerId: string; quantity: number; status: string; orderedAt: Date }>;
    verification: { farmVerified: boolean; qualityChecked: boolean; rating: number };
    expiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ProduceListingSchema = new Schema<IProduceListing>(
    {
        farmerId: { type: String, required: true, index: true },
        productName: { type: String, required: true },
        category: {
            type: String,
            required: true,
            enum: ['grains', 'tubers', 'vegetables', 'fruits', 'livestock', 'dairy', 'poultry'],
            index: true,
        },
        variety: String,
        quantity: {
            amount: { type: Number, required: true },
            unit: { type: String, enum: ['kg', 'g', 'liters', 'pieces', 'bags'], required: true },
            available: { type: Number, required: true },
        },
        quality: {
            grade: { type: String, enum: ['A', 'B', 'C'], default: 'A' },
            organic: { type: Boolean, default: false },
            certifications: [String],
            images: [String],
            description: String,
        },
        pricing: {
            pricePerUnit: { type: Number, required: true },
            currency: { type: String, default: 'NGN' },
            minOrder: { type: Number, default: 1 },
            bulkDiscount: { minQuantity: Number, discountPercent: Number },
        },
        location: {
            farmAddress: String,
            coordinates: { type: [Number], required: true },
            city: { type: String, index: true },
            state: { type: String, index: true },
            pickupAvailable: { type: Boolean, default: true },
            deliveryRadius: { type: Number, default: 10 },
        },
        harvestDate: { type: Date, required: true },
        shelfLife: { type: Number, required: true },
        status: {
            type: String,
            enum: ['available', 'reserved', 'sold', 'harvested', 'expired'],
            default: 'available',
            index: true,
        },
        orders: [{ buyerId: String, quantity: Number, status: String, orderedAt: Date }],
        verification: {
            farmVerified: { type: Boolean, default: false },
            qualityChecked: { type: Boolean, default: false },
            rating: Number,
        },
        expiresAt: Date,
    },
    { timestamps: true, collection: 'produce_listings' },
);

ProduceListingSchema.index({ 'location.coordinates': '2dsphere' });
ProduceListingSchema.index({ category: 1, status: 1 });

export const ProduceListing = mongoose.model<IProduceListing>('ProduceListing', ProduceListingSchema);
