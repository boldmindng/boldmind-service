import mongoose, { Schema, Document } from 'mongoose';

export interface ITransfer extends Document {
    userId: string;
    amount: {
        send: number;
        sendCurrency: string;
        receive: number;
        receiveCurrency: string;
    };
    rates: {
        official: number;
        blackMarket: number;
        selected: number;
        provider: string;
    };
    sender: {
        name: string;
        country: string;
        accountDetails: Map<string, any>;
    };
    recipient: {
        name: string;
        phone: string;
        bank: string;
        accountNumber: string;
        accountName: string;
    };
    receipt: { id: string; url: string; issuedAt: Date };
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    timeline: Array<{ status: string; timestamp: Date; message: string }>;
    fees: { providerFee: number; transferFee: number; totalFee: number };
    estimatedDelivery: string;
    actualDelivery?: Date;
    trackingId: string;
    createdAt: Date;
    updatedAt: Date;
}

const TransferSchema = new Schema<ITransfer>(
    {
        userId: { type: String, required: true, index: true },
        amount: {
            send: { type: Number, required: true },
            sendCurrency: { type: String, required: true },
            receive: { type: Number, required: true },
            receiveCurrency: { type: String, required: true },
        },
        rates: {
            official: Number,
            blackMarket: Number,
            selected: { type: Number, required: true },
            provider: String,
        },
        sender: {
            name: String,
            country: String,
            accountDetails: { type: Map, of: Schema.Types.Mixed },
        },
        recipient: {
            name: { type: String, required: true },
            phone: String,
            bank: { type: String, required: true },
            accountNumber: { type: String, required: true },
            accountName: { type: String, required: true },
        },
        receipt: { id: String, url: String, issuedAt: Date },
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
            default: 'pending',
            index: true,
        },
        timeline: [{ status: String, timestamp: Date, message: String }],
        fees: { providerFee: Number, transferFee: Number, totalFee: Number },
        estimatedDelivery: String,
        actualDelivery: Date,
        trackingId: { type: String, unique: true, index: true },
    },
    { timestamps: true, collection: 'transfers' },
);

TransferSchema.index({ userId: 1, status: 1 });
TransferSchema.index({ createdAt: -1 });

export const Transfer = mongoose.model<ITransfer>('Transfer', TransferSchema);
