-- CreateEnum
CREATE TYPE "VibeCoderStatus" AS ENUM ('APPLIED', 'SHORTLISTED', 'ASSESSED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('THEFT', 'ROBBERY', 'BURGLARY', 'ASSAULT', 'DOMESTIC_VIOLENCE', 'KIDNAPPING', 'ACCIDENT', 'FIRE', 'MEDICAL_EMERGENCY', 'SUSPICIOUS_ACTIVITY', 'MISSING_PERSON', 'FRAUD', 'CYBERCRIME', 'DRUG_RELATED', 'NOISE_COMPLAINT', 'TRESPASSING', 'VANDALISM', 'OTHER');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'VERIFIED', 'INVESTIGATING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'FALSE_REPORT');

-- CreateEnum
CREATE TYPE "UpdateType" AS ENUM ('STATUS_CHANGE', 'ASSIGNMENT', 'EVIDENCE_ADDED', 'NOTE_ADDED', 'RESOLUTION');

-- CreateEnum
CREATE TYPE "EmergencyType" AS ENUM ('EMERGENCY_911', 'FIRE', 'MEDICAL', 'POLICE', 'RESCUE', 'OTHER');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('PENDING', 'DISPATCHED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('CRIME_ALERT', 'MISSING_PERSON', 'WANTED_PERSON', 'TRAFFIC_ALERT', 'WEATHER_WARNING', 'COMMUNITY_NOTICE', 'SAFETY_TIP', 'CURFEW', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "WantedStatus" AS ENUM ('ACTIVE', 'CAPTURED', 'CLEARED', 'INACTIVE');

-- AlterEnum
ALTER TYPE "EcosystemRole" ADD VALUE 'vibe_coder';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'vibe_coder';

-- CreateTable
CREATE TABLE "vibecoders_cohorts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "applicationDeadline" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "enrolledCount" INTEGER NOT NULL DEFAULT 0,
    "priceMin" INTEGER NOT NULL,
    "priceMax" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vibecoders_cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vibecoders_applicants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "idea" TEXT NOT NULL,
    "obstacle" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,
    "status" "VibeCoderStatus" NOT NULL DEFAULT 'APPLIED',
    "assessmentToken" TEXT,
    "assessmentExpiry" TIMESTAMP(3),
    "assessmentData" JSONB,
    "assessmentScore" JSONB,
    "assessedAt" TIMESTAMP(3),
    "cohortId" TEXT,
    "paymentPath" TEXT,
    "paystackRef" TEXT,
    "enrolledAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "source" TEXT,
    "referralCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vibecoders_applicants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "incidentType" "IncidentType" NOT NULL,
    "description" TEXT NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "priorityScore" INTEGER NOT NULL DEFAULT 50,
    "incidentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "evidenceUrls" TEXT[],
    "witnesses" JSONB,
    "assignedOfficerId" TEXT,
    "officerNotes" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "reporterContact" TEXT,
    "aiAnalysis" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_updates" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "updateType" "UpdateType" NOT NULL,
    "message" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedByRole" TEXT NOT NULL,
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_verifications" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "verifiedBy" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL,
    "confidence" INTEGER NOT NULL,
    "notes" TEXT,
    "evidenceUrls" TEXT[],
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "officers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeNumber" TEXT NOT NULL,
    "rank" TEXT,
    "department" TEXT,
    "station" TEXT,
    "phone" TEXT,
    "emergencyContact" TEXT,
    "assignedArea" JSONB,
    "lastLatitude" DECIMAL(10,8),
    "lastLongitude" DECIMAL(11,8),
    "lastSeenAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOnDuty" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "incidentsResolved" INTEGER NOT NULL DEFAULT 0,
    "responseTime" INTEGER,
    "rating" DECIMAL(3,2),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "officers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_logs" (
    "id" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "route" JSONB,
    "distanceKm" DECIMAL(8,2),
    "incidentsResponded" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "checkpoints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrol_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_responses" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT,
    "emergencyType" "EmergencyType" NOT NULL,
    "description" TEXT NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "address" TEXT,
    "callerPhone" TEXT,
    "callerName" TEXT,
    "status" "ResponseStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL,
    "dispatchedOfficers" TEXT[],
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "responseNotes" TEXT,
    "outcome" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_alerts" (
    "id" TEXT NOT NULL,
    "alertType" "AlertType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "targetAreas" JSONB,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "radiusKm" DECIMAL(6,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "issuedBy" TEXT NOT NULL,
    "issuedByRole" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crime_hotspots" (
    "id" TEXT NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "area" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "crimeType" "IncidentType" NOT NULL,
    "incidentCount" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "timePatterns" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crime_hotspots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "police_stations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stationCode" TEXT NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "serviceArea" JSONB,
    "officerCount" INTEGER NOT NULL DEFAULT 0,
    "vehicleCount" INTEGER NOT NULL DEFAULT 0,
    "isOperational" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "police_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wanted_persons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT[],
    "age" INTEGER,
    "gender" "Gender",
    "height" TEXT,
    "weight" TEXT,
    "complexion" TEXT,
    "charges" TEXT[],
    "description" TEXT NOT NULL,
    "photoUrls" TEXT[],
    "lastSeenLocation" TEXT,
    "lastSeenDate" TIMESTAMP(3),
    "status" "WantedStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL,
    "rewardAmount" DECIMAL(10,2),
    "tiplinePhone" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "tipCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wanted_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EmergencyResponseToOfficer" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EmergencyResponseToOfficer_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "vibecoders_cohorts_slug_key" ON "vibecoders_cohorts"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "vibecoders_applicants_email_key" ON "vibecoders_applicants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vibecoders_applicants_assessmentToken_key" ON "vibecoders_applicants"("assessmentToken");

-- CreateIndex
CREATE INDEX "vibecoders_applicants_status_idx" ON "vibecoders_applicants"("status");

-- CreateIndex
CREATE INDEX "vibecoders_applicants_cohortId_idx" ON "vibecoders_applicants"("cohortId");

-- CreateIndex
CREATE INDEX "vibecoders_applicants_email_idx" ON "vibecoders_applicants"("email");

-- CreateIndex
CREATE INDEX "incidents_incidentType_idx" ON "incidents"("incidentType");

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "incidents_severity_idx" ON "incidents"("severity");

-- CreateIndex
CREATE INDEX "incidents_reportedAt_idx" ON "incidents"("reportedAt");

-- CreateIndex
CREATE INDEX "incidents_city_state_idx" ON "incidents"("city", "state");

-- CreateIndex
CREATE INDEX "incidents_latitude_longitude_idx" ON "incidents"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "incident_updates_incidentId_idx" ON "incident_updates"("incidentId");

-- CreateIndex
CREATE INDEX "incident_updates_createdAt_idx" ON "incident_updates"("createdAt");

-- CreateIndex
CREATE INDEX "incident_verifications_incidentId_idx" ON "incident_verifications"("incidentId");

-- CreateIndex
CREATE UNIQUE INDEX "officers_userId_key" ON "officers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "officers_badgeNumber_key" ON "officers"("badgeNumber");

-- CreateIndex
CREATE INDEX "officers_badgeNumber_idx" ON "officers"("badgeNumber");

-- CreateIndex
CREATE INDEX "officers_isActive_idx" ON "officers"("isActive");

-- CreateIndex
CREATE INDEX "officers_station_idx" ON "officers"("station");

-- CreateIndex
CREATE INDEX "patrol_logs_officerId_idx" ON "patrol_logs"("officerId");

-- CreateIndex
CREATE INDEX "patrol_logs_startTime_idx" ON "patrol_logs"("startTime");

-- CreateIndex
CREATE INDEX "emergency_responses_status_idx" ON "emergency_responses"("status");

-- CreateIndex
CREATE INDEX "emergency_responses_priority_idx" ON "emergency_responses"("priority");

-- CreateIndex
CREATE INDEX "emergency_responses_reportedAt_idx" ON "emergency_responses"("reportedAt");

-- CreateIndex
CREATE INDEX "safety_alerts_isActive_idx" ON "safety_alerts"("isActive");

-- CreateIndex
CREATE INDEX "safety_alerts_severity_idx" ON "safety_alerts"("severity");

-- CreateIndex
CREATE INDEX "safety_alerts_publishedAt_idx" ON "safety_alerts"("publishedAt");

-- CreateIndex
CREATE INDEX "crime_hotspots_city_state_idx" ON "crime_hotspots"("city", "state");

-- CreateIndex
CREATE INDEX "crime_hotspots_riskScore_idx" ON "crime_hotspots"("riskScore");

-- CreateIndex
CREATE UNIQUE INDEX "police_stations_stationCode_key" ON "police_stations"("stationCode");

-- CreateIndex
CREATE INDEX "police_stations_city_state_idx" ON "police_stations"("city", "state");

-- CreateIndex
CREATE INDEX "wanted_persons_status_idx" ON "wanted_persons"("status");

-- CreateIndex
CREATE INDEX "wanted_persons_priority_idx" ON "wanted_persons"("priority");

-- CreateIndex
CREATE INDEX "_EmergencyResponseToOfficer_B_index" ON "_EmergencyResponseToOfficer"("B");

-- AddForeignKey
ALTER TABLE "vibecoders_applicants" ADD CONSTRAINT "vibecoders_applicants_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "vibecoders_cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assignedOfficerId_fkey" FOREIGN KEY ("assignedOfficerId") REFERENCES "officers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_verifications" ADD CONSTRAINT "incident_verifications_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_logs" ADD CONSTRAINT "patrol_logs_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "officers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmergencyResponseToOfficer" ADD CONSTRAINT "_EmergencyResponseToOfficer_A_fkey" FOREIGN KEY ("A") REFERENCES "emergency_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmergencyResponseToOfficer" ADD CONSTRAINT "_EmergencyResponseToOfficer_B_fkey" FOREIGN KEY ("B") REFERENCES "officers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
