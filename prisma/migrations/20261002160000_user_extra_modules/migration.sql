-- AlterTable
ALTER TABLE "User" ADD COLUMN     "extraModules" TEXT[] DEFAULT ARRAY[]::TEXT[];

