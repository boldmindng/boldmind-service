import { Controller, All, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

const WAITLIST_SERVICES: Record<string, { name: string; description: string; slug: string }> = {
  'afrocopy-ai': {
    name: 'AfroCopy AI',
    description: 'AI-powered copywriting in Nigerian languages — Pidgin, Yoruba, Igbo, Hausa.',
    slug: 'afrocopy-ai',
  },
  'anontruth-mic': {
    name: 'AnonTruth Mic',
    description: 'Anonymous audio reporting for community issues — your voice, your truth, safely.',
    slug: 'anontruth-mic',
  },
  'power-alert': {
    name: 'Power Alert',
    description: 'Real-time NEPA/electricity supply alerts and predictions for your area.',
    slug: 'power-alert',
  },
};

function buildResponse(serviceKey: string) {
  const service = WAITLIST_SERVICES[serviceKey];
  return {
    success: false,
    waitlist: true,
    service: service?.name ?? serviceKey,
    message: service
      ? `${service.name} is coming soon. Join the waitlist to be first in line.`
      : 'This service is not yet available.',
    description: service?.description,
    joinWaitlist: service
      ? `https://villagecircle.ng/waitlist?service=${service.slug}`
      : 'https://villagecircle.ng/waitlist',
    status: 503,
  };
}

@ApiTags('VillageCircle / Coming Soon')
@Controller('villagecircle')
export class WaitlistController {
  @All('afrocopy-ai/*')
  @All('afrocopy-ai')
  @HttpCode(HttpStatus.SERVICE_UNAVAILABLE)
  @ApiOperation({ summary: 'AfroCopy AI — coming soon' })
  afroCopy() {
    return buildResponse('afrocopy-ai');
  }

  @All('anontruth-mic/*')
  @All('anontruth-mic')
  @HttpCode(HttpStatus.SERVICE_UNAVAILABLE)
  @ApiOperation({ summary: 'AnonTruth Mic — coming soon' })
  anonTruth() {
    return buildResponse('anontruth-mic');
  }

  @All('power-alert/*')
  @All('power-alert')
  @HttpCode(HttpStatus.SERVICE_UNAVAILABLE)
  @ApiOperation({ summary: 'Power Alert — coming soon' })
  powerAlert() {
    return buildResponse('power-alert');
  }

}
