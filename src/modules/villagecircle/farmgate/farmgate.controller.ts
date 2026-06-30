import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { FarmgateService } from './farmgate.service';

@ApiTags('VillageCircle / FarmgateDirect')
@Controller('villagecircle/farmgate')
export class FarmgateController {
  constructor(private readonly service: FarmgateService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Get produce categories' })
  categories() {
    return this.service.getCategories();
  }

  @Get()
  @ApiOperation({ summary: 'Browse available farm produce (public)' })
  browse(
    @Query('category') category?: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('organic') organic?: string,
    @Query('maxPrice') maxPrice?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.browseProduce({
      category, city, state,
      organic: organic === 'true' ? true : undefined,
      maxPrice, page, limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'View a produce listing (public)' })
  findOne(@Param('id') id: string) {
    return this.service.getListingById(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a produce listing (as farmer)' })
  create(@CurrentUser('id') farmerId: string, @Body() dto: any) {
    return this.service.createListing(farmerId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('mine/listings')
  @ApiOperation({ summary: 'Get my produce listings (farmer view)' })
  myListings(
    @CurrentUser('id') farmerId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getMyListings(farmerId, page, limit);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Put(':id')
  @ApiOperation({ summary: 'Update a produce listing (farmer only)' })
  update(@CurrentUser('id') farmerId: string, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateListing(farmerId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a produce listing (farmer only)' })
  remove(@CurrentUser('id') farmerId: string, @Param('id') id: string) {
    return this.service.deleteListing(farmerId, id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post(':id/order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Place an order on a produce listing (buyer)' })
  order(
    @CurrentUser('id') buyerId: string,
    @Param('id') listingId: string,
    @Body() dto: { quantity: number },
  ) {
    return this.service.placeBuyerOrder(buyerId, listingId, dto.quantity);
  }
}
