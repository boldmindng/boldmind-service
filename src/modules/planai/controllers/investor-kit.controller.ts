import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { InvestorKitService } from '../services/investor-kit.service';
import { GenerateSafeDto, DataRoomDto } from '../dto/all-planai.dto';

interface JwtPayload { sub: string; id: string; }

@Controller('planai/investor')
@UseGuards(JwtAuthGuard)
export class InvestorKitController {
  constructor(private readonly investorService: InvestorKitService) {}

  // POST /planai/investor/safe
  @Post('safe')
  generateSafe(
    @Body() dto: GenerateSafeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.investorService.generateSafe(user.sub, dto);
  }

  // POST /planai/investor/data-room
  @Post('data-room')
  setupDataRoom(
    @Body() dto: DataRoomDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.investorService.setupDataRoom(user.sub, dto);
  }

  // POST /planai/investor/cap-table
  @Post('cap-table')
  generateCapTable(
    @Body() body: {
      founders: Array<{ name: string; sharesPercent: number }>;
      investors?: Array<{ name: string; amount: number; equity: number }>;
      optionPool?: number;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.investorService.generateCapTable(user.sub, body);
  }

  // GET /planai/investor/vcs
  @Get('vcs')
  getVCTracker() {
    return this.investorService.getVCTracker();
  }

  // POST /planai/investor/update
  @Post('update')
  generateInvestorUpdate(
    @Body() body: {
      companyName: string;
      period: string;
      metrics: Record<string, unknown>;
      highlights: string[];
      challenges: string[];
      ask?: string;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.investorService.generateInvestorUpdate(user.sub, body);
  }
}