-- Nouveau type de job : copie de l'audio d'un épisode depuis l'ancien hébergeur (migration).
ALTER TYPE "JobType" ADD VALUE 'IMPORT_AUDIO';
