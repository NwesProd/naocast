-- CreateEnum
CREATE TYPE "EpisodeStatus" AS ENUM ('DRAFT', 'QUEUED', 'PROCESSING', 'READY_FOR_REVIEW', 'EXPORTED', 'HUMAN_EDITOR_REQUESTED', 'FAILED');

-- CreateEnum
CREATE TYPE "CameraSetup" AS ENUM ('PRE_EDITED', 'MULTI_CAMERA');

-- CreateEnum
CREATE TYPE "RushSourceType" AS ENUM ('SMASH', 'GOOGLE_DRIVE', 'DROPBOX', 'UPLOAD');

-- CreateEnum
CREATE TYPE "RushStatus" AS ENUM ('PENDING', 'FETCHING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CutSource" AS ENUM ('AUTOCUT', 'MANUAL');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FETCH_RUSHES', 'TRANSCRIBE', 'SYNC_MULTICAM', 'AUTOCUT', 'APPLY_MANUAL_CUTS', 'RENDER', 'EXPORT_AUDIO');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportType" AS ENUM ('VIDEO', 'AUDIO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Podcast" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverKey" TEXT,
    "introKey" TEXT,
    "outroKey" TEXT,
    "logoKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Podcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "title" TEXT,
    "status" "EpisodeStatus" NOT NULL DEFAULT 'DRAFT',
    "cameraSetup" "CameraSetup",
    "autocutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autocutSilenceMs" INTEGER,
    "humanEditorRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RushSource" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "type" "RushSourceType" NOT NULL,
    "status" "RushStatus" NOT NULL DEFAULT 'PENDING',
    "externalRef" TEXT,
    "originalFilename" TEXT,
    "storageKey" TEXT,
    "durationSec" DOUBLE PRECISION,
    "fileSizeBytes" BIGINT,
    "selectedForEpisode" BOOLEAN NOT NULL DEFAULT true,
    "detectedTheme" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RushSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "speaker" TEXT,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutMarker" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "source" "CutSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CutMarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "sequence" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportAsset" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "type" "ExportType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Podcast_userId_key" ON "Podcast"("userId");

-- CreateIndex
CREATE INDEX "ProcessingJob_status_sequence_idx" ON "ProcessingJob"("status", "sequence");

-- AddForeignKey
ALTER TABLE "Podcast" ADD CONSTRAINT "Podcast_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "Podcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RushSource" ADD CONSTRAINT "RushSource_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutMarker" ADD CONSTRAINT "CutMarker_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportAsset" ADD CONSTRAINT "ExportAsset_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
