import { prisma } from "@/lib/db";
import type { GeneratedRecipeInput, RecipeView } from "@/lib/types/domain";
import { endOfIsoDate, startOfIsoDate } from "@/lib/utils/date";
import { recipeWithChildren, serializeRecipe } from "./serializers";

export async function createRecipes(input: {
  profileId: string;
  sourceScanId?: string;
  recipes: GeneratedRecipeInput[];
}) {
  const recipes = await prisma.$transaction(async (tx) => {
    await tx.profile.upsert({
      where: { id: input.profileId },
      update: {},
      create: { id: input.profileId }
    });

    const created: RecipeView[] = [];
    for (const recipe of input.recipes) {
      const record = await tx.recipe.create({
        data: {
          profileId: input.profileId,
          sourceScanId: input.sourceScanId,
          cuisineStyle: recipe.cuisineStyle,
          difficulty: recipe.difficulty,
          referenceImageQuery: recipe.referenceImageQuery,
          estimatedCookingMinutes: recipe.estimatedCookingMinutes,
          servings: recipe.servings,
          estimatedCaloriesPerServing: recipe.estimatedCaloriesPerServing,
          translations: {
            create: recipe.translations.map((translation) => ({
              locale: translation.locale,
              title: translation.title,
              shortDescription: translation.shortDescription,
              nutritionDisclaimer: translation.nutritionDisclaimer
            }))
          },
          ingredients: {
            create: recipe.ingredients.map((ingredient, index) => ({
              normalizedName: ingredient.normalizedName,
              nameEn: ingredient.nameEn,
              nameZh: ingredient.nameZh,
              amount: ingredient.amount,
              isRecognizedIngredient: ingredient.isRecognizedIngredient,
              isOptional: ingredient.isOptional,
              position: index
            }))
          },
          steps: {
            create: recipe.steps.map((step) => ({
              stepNumber: step.stepNumber,
              estimatedMinutes: step.estimatedMinutes,
              instructionEn: step.instructionEn,
              instructionZh: step.instructionZh
            }))
          },
          tips: {
            create: recipe.tips.map((tip, index) => ({
              position: index,
              contentEn: tip.contentEn,
              contentZh: tip.contentZh
            }))
          },
          missingIngredients: {
            create: recipe.missingIngredients.map((ingredient) => ({
              normalizedName: ingredient.normalizedName,
              nameEn: ingredient.nameEn,
              nameZh: ingredient.nameZh,
              isOptional: ingredient.isOptional
            }))
          }
        },
        include: recipeWithChildren
      });
      created.push(serializeRecipe(record));
    }
    return created;
  });

  return recipes;
}

export async function listRecipes(profileId: string, favoritesOnly = false) {
  const recipes = await prisma.recipe.findMany({
    where: {
      profileId,
      ...(favoritesOnly ? { isFavorite: true } : {})
    },
    orderBy: { createdAt: "desc" },
    include: recipeWithChildren
  });
  return recipes.map(serializeRecipe);
}

export async function listRecipesByDate(profileId: string, date: string) {
  const recipes = await prisma.recipe.findMany({
    where: {
      profileId,
      createdAt: {
        gte: startOfIsoDate(date),
        lte: endOfIsoDate(date)
      }
    },
    orderBy: { createdAt: "desc" },
    include: recipeWithChildren
  });
  return recipes.map(serializeRecipe);
}

export async function getRecipe(profileId: string, recipeId: string) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, profileId },
    include: recipeWithChildren
  });
  return recipe ? serializeRecipe(recipe) : null;
}

export async function setRecipeFavorite(input: {
  profileId: string;
  recipeId: string;
  isFavorite: boolean;
}) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: input.recipeId, profileId: input.profileId }
  });
  if (!recipe) {
    return null;
  }
  const updated = await prisma.recipe.update({
    where: { id: input.recipeId },
    data: { isFavorite: input.isFavorite },
    include: recipeWithChildren
  });
  return serializeRecipe(updated);
}

export async function deleteRecipe(profileId: string, recipeId: string) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, profileId }
  });
  if (!recipe) {
    return false;
  }
  await prisma.recipe.delete({ where: { id: recipeId } });
  return true;
}
