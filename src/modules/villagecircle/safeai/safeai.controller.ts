import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { SafeAiService } from './safeai.service';
import { IncidentType, Severity, IncidentStatus, AlertType, WantedStatus } from '@prisma/client';

@ApiTags('VillageCircle / SafeAI')
@Controller('villagecircle/safeai')
export class SafeAiController {
  constructor(private readonly service: SafeAiService) {}

  // ── Incidents ──────────────────────────────────────────────────────────────

  @Public()
  @Post('incidents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a new incident (anonymous or identified)' })
  reportIncident(@Body() dto: {
    reporterId?: string;
    incidentType: IncidentType;
    description: string;
    latitude: number;
    longitude: number;
    address?: string;
    city?: string;
    state?: string;
    severity?: Severity;
    incidentDate?: Date;
    evidenceUrls?: string[];
    witnesses?: any;
    isAnonymous?: boolean;
    reporterContact?: string;
  }) {
    return this.service.reportIncident(dto);
  }

  @Public()
  @Get('incidents')
  @ApiOperation({ summary: 'Browse reported incidents (public, filtered)' })
  getIncidents(
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('incidentType') incidentType?: IncidentType,
    @Query('severity') severity?: Severity,
    @Query('status') status?: IncidentStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getIncidents({ city, state, incidentType, severity, status, page, limit });
  }

  @Public()
  @Get('incidents/:id')
  @ApiOperation({ summary: 'Get incident detail with updates and verifications' })
  getIncident(@Param('id') id: string) {
    return this.service.getIncidentById(id);
  }

  // ── Hotspots ───────────────────────────────────────────────────────────────

  @Public()
  @Get('hotspots')
  @ApiOperation({ summary: 'Get crime hotspots near a location' })
  getHotspots(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('radius') radius?: number,
  ) {
    return this.service.getNearbyHotspots(Number(lat), Number(lng), radius ? Number(radius) : 10);
  }

  // ── Safety alerts ──────────────────────────────────────────────────────────

  @Public()
  @Get('alerts')
  @ApiOperation({ summary: 'Get active safety alerts' })
  getAlerts(
    @Query('alertType') alertType?: AlertType,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getActiveAlerts({ alertType, page, limit });
  }

  // ── Wanted persons ─────────────────────────────────────────────────────────

  @Public()
  @Get('wanted')
  @ApiOperation({ summary: 'Get wanted persons list' })
  getWanted(@Query('status') status?: WantedStatus, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.service.getWantedPersons({ status, page, limit });
  }

  // ── Police stations ────────────────────────────────────────────────────────

  @Public()
  @Get('stations')
  @ApiOperation({ summary: 'Get nearby police stations' })
  getStations(@Query('city') city?: string, @Query('state') state?: string) {
    return this.service.getPoliceStations({ city, state });
  }

  // ── Emergency ──────────────────────────────────────────────────────────────

  @Public()
  @Post('emergency')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Call for emergency response' })
  emergency(@Body() dto: {
    emergencyType: string;
    description: string;
    latitude: number;
    longitude: number;
    address?: string;
    callerPhone?: string;
    callerName?: string;
    priority?: number;
  }) {
    return this.service.callEmergency(dto);
  }

  // ── Admin: incident management ─────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin', 'officer')
  @ApiBearerAuth('access-token')
  @Patch('admin/incidents/:id/status')
  @ApiOperation({ summary: '[Admin/Officer] Update incident status' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('id') officerId: string,
    @Body() dto: { status: IncidentStatus; notes?: string; assignedOfficerId?: string },
  ) {
    return this.service.updateIncidentStatus(id, officerId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin', 'officer')
  @ApiBearerAuth('access-token')
  @Post('admin/incidents/:id/verify')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[Admin/Officer] Verify or dispute an incident report' })
  verifyIncident(
    @Param('id') id: string,
    @CurrentUser('id') verifierId: string,
    @Body() dto: { isVerified: boolean; confidence: number; notes?: string; evidenceUrls?: string[] },
  ) {
    return this.service.verifyIncident(id, verifierId, dto);
  }

  // ── Admin: alerts ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth('access-token')
  @Post('admin/alerts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[Admin] Publish a safety alert' })
  publishAlert(
    @CurrentUser('id') issuerId: string,
    @CurrentUser('role') issuerRole: string,
    @Body() dto: {
      alertType: AlertType;
      title: string;
      message: string;
      severity: Severity;
      targetAreas?: any;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      expiresAt?: Date;
    },
  ) {
    return this.service.publishAlert(issuerId, issuerRole ?? 'admin', dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth('access-token')
  @Delete('admin/alerts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Deactivate a safety alert' })
  deactivateAlert(@Param('id') id: string) {
    return this.service.deactivateAlert(id);
  }

  // ── Admin: wanted persons ──────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth('access-token')
  @Post('admin/wanted')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[Admin] Add a wanted person' })
  createWanted(@Body() dto: {
    name: string;
    alias?: string[];
    age?: number;
    gender?: any;
    height?: string;
    weight?: string;
    complexion?: string;
    charges: string[];
    description: string;
    photoUrls?: string[];
    lastSeenLocation?: string;
    lastSeenDate?: Date;
    priority: number;
    rewardAmount?: number;
    tiplinePhone?: string;
  }) {
    return this.service.createWantedPerson(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth('access-token')
  @Patch('admin/wanted/:id/status')
  @ApiOperation({ summary: '[Admin] Update wanted person status (CAPTURED / CLEARED / INACTIVE)' })
  updateWantedStatus(@Param('id') id: string, @Body('status') status: WantedStatus) {
    return this.service.updateWantedPersonStatus(id, status);
  }

  // ── Admin: stats ───────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth('access-token')
  @Get('admin/stats')
  @ApiOperation({ summary: '[Admin] SafeAI dashboard statistics' })
  stats() {
    return this.service.getAdminStats();
  }
}
