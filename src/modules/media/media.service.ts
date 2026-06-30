// src/modules/media/media.service.ts
import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';

export type MediaFolder = 'avatars' | 'articles' | 'products' | 'storefronts' | 'amebogist' | 'misc' | 'viralkit';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOC_TYPES = ['application/pdf'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly r2: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.bucket = this.config.get<string>('R2_BUCKET_NAME');
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL'); // e.g. https://cdn.boldmind.ng

    this.r2 = new S3Client({
      region: 'auto',
      endpoint: this.config.get<string>('R2_ENDPOINT'), // https://<ACCOUNT_ID>.r2.cloudflarestorage.com
      credentials: {
        accessKeyId: this.config.get<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.config.get<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  // ─── UPLOAD (single file) ────────────────────────────────────────────────────

  async uploadFile(
    file: Express.Multer.File,
    folder: MediaFolder,
    uploadedById: string,
    options?: { optimize?: boolean; maxWidth?: number },
  ) {
    this.validateFile(file);

    let buffer = file.buffer;
    let contentType = file.mimetype;

    // Auto-optimize images
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype) && options?.optimize !== false) {
      buffer = await this.optimizeImage(buffer, options?.maxWidth ?? 1920);
      contentType = 'image/webp';
    }

    const key = this.buildKey(folder, file.originalname, contentType);

    await this.r2.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: { uploadedBy: uploadedById },
      }),
    );

    const url = `${this.publicUrl}/${key}`;

    const media = await this.prisma.media.create({
      data: {
        key,
        url,
        folder,
        originalName: file.originalname,
        mimeType: contentType,
        size: buffer.length,
        uploadedById,
      },
    });

    return media;
  }

  // ─── UPLOAD MULTIPLE ─────────────────────────────────────────────────────────

  async uploadMultiple(
    files: Express.Multer.File[],
    folder: MediaFolder,
    uploadedById: string,
  ) {
    if (!files?.length) throw new BadRequestException('No files provided');
    if (files.length > 10) throw new BadRequestException('Max 10 files per upload');

    const results = await Promise.allSettled(
      files.map(f => this.uploadFile(f, folder, uploadedById)),
    );

    return {
      uploaded: results.filter(r => r.status === 'fulfilled').map(r => (r as any).value),
      failed: results.filter(r => r.status === 'rejected').length,
    };
  }

  // ─── PRESIGNED URL (direct browser upload) ───────────────────────────────────

  async getPresignedUploadUrl(
    folder: MediaFolder,
    fileName: string,
    mimeType: string,
    uploadedById: string,
  ) {
    if (!ALLOWED_TYPES.includes(mimeType)) {
      throw new BadRequestException(`File type ${mimeType} not allowed`);
    }

    const key = this.buildKey(folder, fileName, mimeType);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      Metadata: { uploadedBy: uploadedById },
    });

    const signedUrl = await getSignedUrl(this.r2, command, { expiresIn: 3600 });
    const publicUrl = `${this.publicUrl}/${key}`;

    return { uploadUrl: signedUrl, key, publicUrl };
  }

  // ─── GET SIGNED READ URL (private files) ────────────────────────────────────

  async getSignedReadUrl(key: string, expiresIn = 3600) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.r2, command, { expiresIn });
  }

  // ─── DELETE ──────────────────────────────────────────────────────────────────

  async deleteFile(mediaId: string, userId: string, role?: string) {
    const media = await this.prisma.media.findFirst({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Media not found');

    const isOwner = media.uploadedById === userId;
    const isAdmin = ['admin', 'super_admin'].includes(role ?? '');
    if (!isOwner && !isAdmin) throw new BadRequestException('Access denied');

    await this.r2.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: media.key }));
    await this.prisma.media.delete({ where: { id: mediaId } });

    return { message: 'File deleted', key: media.key };
  }

  // ─── LIST USER'S MEDIA ───────────────────────────────────────────────────────

  async getUserMedia(userId: string, folder?: MediaFolder, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: any = { uploadedById: userId };
    if (folder) where.folder = folder;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.media.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.media.count({ where }),
    ]);

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ─── ADMIN LIST ALL ──────────────────────────────────────────────────────────

  async adminListAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.media.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.media.count(),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ─── IMAGE OPTIMIZATION ──────────────────────────────────────────────────────

  private async optimizeImage(buffer: Buffer, maxWidth: number): Promise<Buffer> {
    return sharp(buffer)
      .resize(maxWidth, undefined, { withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: 82 })
      .toBuffer();
  }

  // ─── VALIDATION ──────────────────────────────────────────────────────────────

  private validateFile(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`File type "${file.mimetype}" is not allowed`);
    }
  }

  // ─── KEY BUILDER ─────────────────────────────────────────────────────────────

  private buildKey(folder: MediaFolder, originalName: string, mimeType: string): string {
    const ext = mimeType === 'image/webp' ? '.webp' : path.extname(originalName) || '.bin';
    const hash = crypto.randomBytes(8).toString('hex');
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    return `${folder}/${date}/${hash}${ext}`;
  }
}