import mongoose, { Schema, Document } from 'mongoose';

export interface IReceipt extends Document {
    userId: string;
    businessId?: string;
    receiptNumber: string;
    customer: { name?: string; email?: string; phone?: string; address?: string };
    vendor: { name: string; address?: string; phone?: string; email?: string; logo?: string; taxId?: string };
    items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    currency: string;
    paymentMethod?: string;
    paymentStatus: 'paid' | 'pending' | 'refunded';
    issueDate: Date;
    dueDate?: Date;
    paidDate?: Date;
    pdfUrl?: string;
    imageUrl?: string;
    template: string;
    customization: {
        colors: { primary: string; secondary: string };
        font: string;
        showLogo: boolean;
    };
    aiExtracted?: { confidence: number; rawData: any; verified: boolean };
    status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
    notes?: string;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
}

const ReceiptSchema = new Schema<IReceipt>(
    {
        userId: { type: String, required: true, index: true },
        businessId: { type: String, index: true },
        receiptNumber: { type: String, required: true, unique: true },
        customer: { name: String, email: String, phone: String, address: String },
        vendor: { name: { type: String, required: true }, address: String, phone: String, email: String, logo: String, taxId: String },
        items: [{
            description: { type: String, required: true },
            quantity: { type: Number, required: true },
            unitPrice: { type: Number, required: true },
            total: { type: Number, required: true },
        }],
        subtotal: { type: Number, required: true },
        tax: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        total: { type: Number, required: true },
        currency: { type: String, default: 'NGN' },
        paymentMethod: String,
        paymentStatus: { type: String, enum: ['paid', 'pending', 'refunded'], default: 'pending' },
        issueDate: { type: Date, required: true },
        dueDate: Date,
        paidDate: Date,
        pdfUrl: String,
        imageUrl: String,
        template: { type: String, default: 'default' },
        customization: {
            colors: {
                primary: { type: String, default: '#000000' },
                secondary: { type: String, default: '#666666' },
            },
            font: { type: String, default: 'Arial' },
            showLogo: { type: Boolean, default: true },
        },
        aiExtracted: { confidence: Number, rawData: Schema.Types.Mixed, verified: { type: Boolean, default: false } },
        status: { type: String, enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'], default: 'draft', index: true },
        notes: String,
        tags: [String],
    },
    { timestamps: true, collection: 'receipts' },
);

ReceiptSchema.index({ userId: 1, status: 1 });
ReceiptSchema.index({ receiptNumber: 1 });
ReceiptSchema.index({ issueDate: -1 });

export const Receipt = mongoose.model<IReceipt>('Receipt', ReceiptSchema);
