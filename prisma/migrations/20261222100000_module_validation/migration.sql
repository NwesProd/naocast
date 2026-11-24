-- Validation manuelle des modules Extraits et Diffusion.
ALTER TABLE "Episode" ADD COLUMN "extraitsValidated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Episode" ADD COLUMN "diffusionValidated" BOOLEAN NOT NULL DEFAULT false;
