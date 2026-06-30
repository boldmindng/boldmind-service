import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { ReceiptGeniusService } from './receiptgenius.service';

@ApiTags('VillageCircle / ReceiptGenius')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('villagecircle/receiptgenius')
export class ReceiptGeniusController {
  constructor(private readonly service: ReceiptGeniusService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new receipt or invoice' })
  create(@CurrentUser('id') userId: string, @Body() dto: any) {
    return this.service.createReceipt(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List receipts for current user' })
  list(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getReceipts(userId, { status, page, limit });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get receipt stats (totals, revenue)' })
  stats(@CurrentUser('id') userId: string) {
    return this.service.getStats(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single receipt by ID' })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.getReceiptById(userId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a receipt' })
  update(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateReceipt(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a receipt' })
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteReceipt(userId, id);
  }
}
