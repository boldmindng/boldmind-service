import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from "@nestjs/swagger";
import { MediaService, MediaFolder } from "./media.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CurrentUser, Roles } from "../../common/decorators";

@ApiTags("Media")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
@Controller("media")
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  // ─── UPLOAD (single) ──────────────────────────────────────

  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload a single file" })
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser("id") userId: string,
    @Body("folder") folder: MediaFolder = "misc",
    @Body("optimize") optimize?: string,
    @Body("maxWidth") maxWidth?: string,
  ) {
    return this.mediaService.uploadFile(file, folder, userId, {
      optimize: optimize !== "false",
      maxWidth: maxWidth ? parseInt(maxWidth, 10) : undefined,
    });
  }

  // ─── UPLOAD (multiple) ────────────────────────────────────

  @Post("upload/batch")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FilesInterceptor("files", 10))
  @ApiOperation({ summary: "Upload multiple files (max 10)" })
  uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser("id") userId: string,
    @Body("folder") folder: MediaFolder = "misc",
  ) {
    return this.mediaService.uploadMultiple(files, folder, userId);
  }

  // ─── PRESIGNED UPLOAD URL ─────────────────────────────────

  @Post("presign")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get a presigned URL for direct browser upload" })
  getPresignedUrl(
    @CurrentUser("id") userId: string,
    @Body() body: { folder: MediaFolder; fileName: string; mimeType: string },
  ) {
    return this.mediaService.getPresignedUploadUrl(
      body.folder,
      body.fileName,
      body.mimeType,
      userId,
    );
  }

  // ─── LIST USER MEDIA ──────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "Get my uploaded media" })
  getMyMedia(
    @CurrentUser("id") userId: string,
    @Query("folder") folder?: MediaFolder,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ) {
    return this.mediaService.getUserMedia(userId, folder, +page, +limit);
  }

  // ─── DELETE ───────────────────────────────────────────────

  @Delete(":id")
  @ApiOperation({ summary: "Delete a media file" })
  deleteFile(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
  ) {
    return this.mediaService.deleteFile(id, userId, role);
  }

  // ─── ADMIN: LIST ALL ──────────────────────────────────────

  @Get("admin/all")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPER_ADMIN")
  @ApiOperation({ summary: "List all media files (admin)" })
  adminListAll(@Query("page") page = 1, @Query("limit") limit = 50) {
    return this.mediaService.adminListAll(+page, +limit);
  }

  // ─── GET SINGLE ───────────────────────────────────────────

  @Get(":id")
  @ApiOperation({ summary: "Get a single media record by id (owner or admin)" })
  getFile(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
  ) {
    return this.mediaService.getMediaById(id, userId, role);
  }

  // ─── SIGNED READ URL ──────────────────────────────────────

  @Get(":id/signed-url")
  @ApiOperation({
    summary: "Get a time-limited signed read URL for a media file",
  })
  getSignedUrl(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
    @Query("expiresIn") expiresIn = "3600",
  ) {
    return this.mediaService.getSignedUrlForMedia(id, userId, role, +expiresIn);
  }
}
