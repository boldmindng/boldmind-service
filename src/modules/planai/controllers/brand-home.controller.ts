import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags, ApiOperation } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { BrandHomeService } from "../services/brand-home.service";
import {
  GenerateLogoDto,
  CreateStoreDto,
  AddProductDto,
  GeneratePortfolioDto,
} from "../dto/all-planai.dto";

interface AuthRequest extends Request {
  user: { id: string };
}

@ApiTags("PlanAI / Brand & Digital Home")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("planai/brand")
export class BrandHomeController {
  constructor(private readonly svc: BrandHomeService) {}

  // ─── Branding ──────────────────────────────────────────────────────────────

  @Post("logo")
  @ApiOperation({ summary: "Generate logo variations via fal.ai FLUX Pro" })
  generateLogo(@Req() req: AuthRequest, @Body() dto: GenerateLogoDto) {
    return this.svc.generateLogo(req.user.id, dto);
  }

  @Post("palette")
  @ApiOperation({
    summary: "Generate brand colour palette for Nigerian industry",
  })
  generatePalette(
    @Req() req: AuthRequest,
    @Body() body: { industry: string; vibe?: string },
  ) {
    return this.svc.generateBrandPalette(req.user.id, body);
  }

  @Post("flyer")
  @ApiOperation({ summary: "Generate WhatsApp-ready business flyer image" })
  generateFlyer(
    @Req() req: AuthRequest,
    @Body()
    body: {
      businessName: string;
      offer: string;
      price?: string;
      style?: "modern" | "traditional" | "luxury" | "playful";
    },
  ) {
    return this.svc.generateWhatsAppFlyer(req.user.id, body);
  }

  // ─── Portfolio / resume ────────────────────────────────────────────────────

  @Post("portfolio")
  @ApiOperation({ summary: "Generate professional portfolio content" })
  generatePortfolio(
    @Req() req: AuthRequest,
    @Body() dto: GeneratePortfolioDto,
  ) {
    return this.svc.generatePortfolio(req.user.id, dto);
  }

  @Post("resume")
  @ApiOperation({ summary: "Generate ATS-friendly Nigerian CV" })
  generateResume(
    @Req() req: AuthRequest,
    @Body()
    body: {
      fullName: string;
      currentRole: string;
      experience: string;
      skills: string[];
      education: string;
      targetRole?: string;
    },
  ) {
    return this.svc.generateResume(req.user.id, body);
  }

  // ─── Stores ────────────────────────────────────────────────────────────────

  @Post("stores")
  @ApiOperation({ summary: "Create a digital storefront" })
  createStore(@Req() req: AuthRequest, @Body() dto: CreateStoreDto) {
    return this.svc.createStore(req.user.id, dto);
  }

  @Get("stores")
  @ApiOperation({ summary: "List my stores" })
  getStores(@Req() req: AuthRequest) {
    return this.svc.getMyStores(req.user.id);
  }

  @Post("stores/:storeId/products")
  @ApiOperation({ summary: "Add product to store" })
  addProduct(
    @Req() req: AuthRequest,
    @Param("storeId") storeId: string,
    @Body() dto: AddProductDto,
  ) {
    return this.svc.addProduct(req.user.id, storeId, dto);
  }

  @Get("stores/:storeId/products")
  @ApiOperation({ summary: "List store products" })
  getProducts(@Req() req: AuthRequest, @Param("storeId") storeId: string) {
    return this.svc.getStoreProducts(req.user.id, storeId);
  }

  @Get("stores/:storeId/orders")
  @ApiOperation({ summary: "List store orders" })
  getOrders(@Req() req: AuthRequest, @Param("storeId") storeId: string) {
    return this.svc.getStoreOrders(req.user.id, storeId);
  }
}
