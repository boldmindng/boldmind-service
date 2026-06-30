import mongoose, { Schema, Document, Types } from 'mongoose';

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOMATION MODULE — n8n_logs & workflow_runs collections
// ═══════════════════════════════════════════════════════════════════════════════

export interface IN8nLog extends Document {
    workflowId: string;    // n8n workflow ID
    workflowName: string;
    executionId: string;   // n8n execution ID
    triggeredBy: string;   // "webhook" | "schedule" | "manual" | userId
    status: 'running' | 'success' | 'error' | 'waiting';
    productSlug?: string;
    userId?: string;
    inputData?: Record<string, unknown>;
    outputData?: Record<string, unknown>;
    errorMessage?: string;
    durationMs?: number;
    nodesExecuted: number;
    createdAt: Date;
    updatedAt: Date;
}

const N8nLogSchema = new Schema<IN8nLog>(
    {
        workflowId: { type: String, required: true, index: true },
        workflowName: { type: String, required: true },
        executionId: { type: String, required: true, unique: true },
        triggeredBy: { type: String, required: true },
        status: {
            type: String,
            enum: ['running', 'success', 'error', 'waiting'],
            default: 'running',
            index: true,
        },
        productSlug: { type: String, index: true },
        userId: { type: String, index: true },
        inputData: Schema.Types.Mixed,
        outputData: Schema.Types.Mixed,
        errorMessage: String,
        durationMs: Number,
        nodesExecuted: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        collection: 'n8n_logs',
    }
);

N8nLogSchema.index({ createdAt: -1 });
N8nLogSchema.index({ userId: 1, createdAt: -1 });

export const N8nLog = mongoose.model<IN8nLog>('N8nLog', N8nLogSchema);

// ─────────────────────────────────────────────────────────────────────────────

export interface IWorkflowRun extends Document {
    workflowType:
    | 'social_post'
    | 'email_campaign'
    | 'ai_receptionist'
    | 'rss_ingest'
    | 'whatsapp_broadcast'
    | 'lead_enrichment';
    userId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
    payload: Record<string, unknown>;
    result?: Record<string, unknown>;
    errorMessage?: string;
    retryCount: number;
    maxRetries: number;
    nextRetryAt?: Date;
    bullJobId?: string;
    n8nLogId?: Types.ObjectId;
    completedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const WorkflowRunSchema = new Schema<IWorkflowRun>(
    {
        workflowType: {
            type: String,
            enum: [
                'social_post',
                'email_campaign',
                'ai_receptionist',
                'rss_ingest',
                'whatsapp_broadcast',
                'lead_enrichment',
            ],
            required: true,
            index: true,
        },
        userId: { type: String, required: true, index: true },
        status: {
            type: String,
            enum: ['pending', 'running', 'completed', 'failed', 'retrying'],
            default: 'pending',
            index: true,
        },
        payload: { type: Schema.Types.Mixed, required: true },
        result: Schema.Types.Mixed,
        errorMessage: String,
        retryCount: { type: Number, default: 0 },
        maxRetries: { type: Number, default: 3 },
        nextRetryAt: Date,
        bullJobId: String,
        n8nLogId: { type: Schema.Types.ObjectId, ref: 'N8nLog' },
        completedAt: Date,
    },
    {
        timestamps: true,
        collection: 'workflow_runs',
    }
);

WorkflowRunSchema.index({ userId: 1, workflowType: 1, createdAt: -1 });
WorkflowRunSchema.index({ status: 1, nextRetryAt: 1 }); // For retry processor

export const WorkflowRun = mongoose.model<IWorkflowRun>('WorkflowRun', WorkflowRunSchema);
