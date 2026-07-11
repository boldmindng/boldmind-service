import { IsString, IsOptional, IsNotEmpty } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SendWhatsappDto {
  @ApiProperty({
    example: "+2348012345678",
    description: "Recipient phone number, E.164 format",
  })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({ example: "Your order has shipped!" })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description:
      "Meta WhatsApp phone_number_id to send from. Defaults to META_WHATSAPP_PHONE_NUMBER_ID env var.",
  })
  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @ApiPropertyOptional({
    description:
      "Override Meta access token (defaults to META_WHATSAPP_TOKEN env var)",
  })
  @IsOptional()
  @IsString()
  accessToken?: string;
}
