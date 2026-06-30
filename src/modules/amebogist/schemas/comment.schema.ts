
import mongoose, { Schema, Document, Types } from 'mongoose';

export type ReactionType = 'like' | 'love' | 'laugh' | 'angry';

export interface IComment extends Document {
  postId: Types.ObjectId;
  parentId?: Types.ObjectId;
  user: {
    id: string;
    name: string;
    avatar?: string;
    isAuthor: boolean;
  };
  content: string;
  language: 'pidgin' | 'english' | 'yoruba' | 'igbo' | 'hausa';
  reactions: {
    like: number;
    love: number;
    laugh: number;
    angry: number;
  };
  /**
   * Per-user reaction tracking Map — NEW field.
   * Key: userId (string), Value: ReactionType
   *
   * Purpose: reactToComment() reads this to know a user's previous reaction
   * so it can toggle it off or decrement the old counter when switching.
   *
   * NOT exposed in public API responses — toCommentDto() omits it.
   */
  userReactions: Map<string, ReactionType>;
  isEdited: boolean;
  editedAt?: Date;
  isFlagged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const CommentSchema = new Schema<IComment>(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      index: true,
    },
    user: {
      id:       { type: String, required: true },
      name:     { type: String, required: true },
      avatar:   String,
      isAuthor: { type: Boolean, default: false },
    },
    content: { type: String, required: true, maxlength: 1000 },
    language: {
      type: String,
      enum: ['pidgin', 'english', 'yoruba', 'igbo', 'hausa'], // FIX: was 'hause'
      default: 'pidgin',
    },
    reactions: {
      like:  { type: Number, default: 0, min: 0 },
      love:  { type: Number, default: 0, min: 0 },
      laugh: { type: Number, default: 0, min: 0 },
      angry: { type: Number, default: 0, min: 0 },
    },
    /**
     * ADDED: userReactions Map
     *
     * Mongoose { type: Map, of: String } stores this as a MongoDB
     * sub-document with dynamic string keys, e.g.:
     *   { "userReactions": { "user_abc": "like", "user_xyz": "love" } }
     *
     * Accessed via: comment.userReactions.get(userId)
     * Updated via:  $set: { "userReactions.userId": "like" }
     *               $unset: { "userReactions.userId": "" }
     */
    userReactions: {
      type: Map,
      of: {
        type: String,
        enum: ['like', 'love', 'laugh', 'angry'],
      },
      default: () => new Map(),
    },
    isEdited:  { type: Boolean, default: false },
    editedAt:  Date,
    isFlagged: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,   // adds createdAt + updatedAt automatically
    collection: 'comments',
  },
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Your original indexes — unchanged
CommentSchema.index({ postId: 1, createdAt: -1 });
CommentSchema.index({ parentId: 1, createdAt: 1 });

// ADDED: Supports getComments() query:
//   .find({ postId, parentId: null, isFlagged: false }).sort({ createdAt: -1 })
CommentSchema.index({ postId: 1, parentId: 1, isFlagged: 1, createdAt: -1 });

// ─────────────────────────────────────────────────────────────────────────────

export const Comment = mongoose.model<IComment>('Comment', CommentSchema);