import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsArray,
  IsIn,
  IsObject,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NG_LANGUAGES } from "../planai.types";

export class ConfigureAgentDto {
  @ApiProperty({ description: "Business context for the AI agent" })
  @IsString()
  @IsNotEmpty()
  businessContext: string;

  @ApiProperty({ description: "FAQ knowledge base" })
  @IsObject()
  faqData: Record<string, string>;

  @ApiPropertyOptional({ description: "Agent persona name" })
  @IsOptional()
  @IsString()
  agentName?: string;

  @ApiPropertyOptional({ description: "Channels to activate" })
  @IsOptional()
  @IsArray()
  @IsIn(["whatsapp", "instagram_dm", "email"], { each: true })
  channels?: string[];

  @ApiPropertyOptional({ enum: NG_LANGUAGES })
  @IsOptional()
  @IsIn(NG_LANGUAGES)
  language?: string = "english";

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  invoiceFollowUpEnabled?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  appointmentEnabled?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  calendarUrl?: string;
}

export class AgentTaskDto {
  @ApiProperty({
    description: "Task type",
    enum: [
      "invoice_followup",
      "appointment_booking",
      "order_update",
      "supplier_comms",
    ],
  })
  @IsIn([
    "invoice_followup",
    "appointment_booking",
    "order_update",
    "supplier_comms",
  ])
  taskType: string;

  @ApiProperty({ description: "Task-specific payload" })
  @IsObject()
  payload: Record<string, unknown>;
}
