import { prisma } from "@/lib/db";
import type {
  EpicurePairingInput,
  IngredientRecognitionResult,
  RecognizedIngredientInput
} from "@/lib/types/domain";
import { endOfIsoDate, startOfIsoDate } from "@/lib/utils/date";
import {
  scanWithIngredients,
  serializePairing,
  serializeScan
} from "./serializers";

export async function createIngredientScan(input: {
  profileId: string;
  imageName: string;
  imageMimeType: string;
  result: IngredientRecognitionResult;
}) {
  const scan = await prisma.$transaction(async (tx) => {
    await tx.profile.upsert({
      where: { id: input.profileId },
      update: {},
      create: { id: input.profileId }
    });

    return tx.ingredientScan.create({
      data: {
        profileId: input.profileId,
        imageName: input.imageName,
        imageMimeType: input.imageMimeType,
        overallConfidence: input.result.overallConfidence,
        uncertaintyNoteEn: input.result.uncertaintyNoteEn,
        uncertaintyNoteZh: input.result.uncertaintyNoteZh,
        ingredients: {
          create: input.result.ingredients.map((ingredient, index) => ({
            normalizedName: ingredient.normalizedName,
            displayNameEn: ingredient.displayNameEn,
            displayNameZh: ingredient.displayNameZh,
            estimatedAmount: ingredient.estimatedAmount,
            estimatedCalories: ingredient.estimatedCalories ?? null,
            confidence: ingredient.confidence,
            notes: ingredient.notes,
            position: index
          }))
        }
      },
      include: scanWithIngredients
    });
  });

  return serializeScan(scan);
}

export async function listIngredientScans(profileId: string) {
  const scans = await prisma.ingredientScan.findMany({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    include: scanWithIngredients
  });
  return scans.map(serializeScan);
}

export async function listIngredientScansByDate(profileId: string, date: string) {
  const scans = await prisma.ingredientScan.findMany({
    where: {
      profileId,
      createdAt: {
        gte: startOfIsoDate(date),
        lte: endOfIsoDate(date)
      }
    },
    orderBy: { createdAt: "desc" },
    include: scanWithIngredients
  });
  return scans.map(serializeScan);
}

export async function getIngredientScan(profileId: string, scanId: string) {
  const scan = await prisma.ingredientScan.findFirst({
    where: { id: scanId, profileId },
    include: scanWithIngredients
  });
  return scan ? serializeScan(scan) : null;
}

export async function getLatestIngredientScan(profileId: string) {
  const scan = await prisma.ingredientScan.findFirst({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    include: scanWithIngredients
  });
  return scan ? serializeScan(scan) : null;
}

export async function updateRecognizedIngredients(input: {
  profileId: string;
  scanId: string;
  ingredients: RecognizedIngredientInput[];
}) {
  const scan = await prisma.ingredientScan.findFirst({
    where: { id: input.scanId, profileId: input.profileId }
  });
  if (!scan) {
    return null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.recognizedIngredient.deleteMany({ where: { scanId: input.scanId } });
    await tx.recognizedIngredient.createMany({
      data: input.ingredients.map((ingredient, index) => ({
        scanId: input.scanId,
        normalizedName: ingredient.normalizedName,
        displayNameEn: ingredient.displayNameEn,
        displayNameZh: ingredient.displayNameZh,
        estimatedAmount: ingredient.estimatedAmount,
        estimatedCalories: ingredient.estimatedCalories ?? null,
        confidence: ingredient.confidence,
        notes: ingredient.notes,
        position: index
      }))
    });
    return tx.ingredientScan.findUniqueOrThrow({
      where: { id: input.scanId },
      include: scanWithIngredients
    });
  });

  return serializeScan(updated);
}

export async function saveEpicurePairings(input: {
  scanId: string;
  pairings: EpicurePairingInput[];
}) {
  await prisma.$transaction(async (tx) => {
    await tx.epicurePairing.deleteMany({ where: { scanId: input.scanId } });
    if (input.pairings.length > 0) {
      await tx.epicurePairing.createMany({
        data: input.pairings.map((pairing) => ({
          scanId: input.scanId,
          sourceIngredient: pairing.sourceIngredient,
          suggestedIngredient: pairing.suggestedIngredient,
          score: pairing.score,
          category: pairing.category,
          reasonEn: pairing.reasonEn,
          reasonZh: pairing.reasonZh
        }))
      });
    }
  });
}

export async function listEpicurePairings(scanId: string) {
  const pairings = await prisma.epicurePairing.findMany({
    where: { scanId },
    orderBy: [{ sourceIngredient: "asc" }, { score: "desc" }]
  });
  return pairings.map(serializePairing);
}

export async function deleteIngredientScan(profileId: string, scanId: string) {
  const scan = await prisma.ingredientScan.findFirst({
    where: { id: scanId, profileId }
  });
  if (!scan) {
    return false;
  }
  await prisma.ingredientScan.delete({ where: { id: scanId } });
  return true;
}
