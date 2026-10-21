import type { Property } from "@/lib/generated/prisma/client";
import { decimalToString } from "@/lib/domain/decimal";

/** Serializable property for Client Components and JSON (decimals as strings). */
export interface PropertyDTO {
  id: string;
  referenceCode: string | null;
  name: string | null;
  address: string | null;
  municipality: string | null;
  department: string | null;
  propertyType: Property["propertyType"];
  rawPropertyType: string | null;
  cadastralId: string | null;
  landAreaM2: string | null;
  buildingAreaM2: string | null;
  askingPriceUsd: string | null;
  pricePerM2Usd: string | null;
  pricePerM2Basis: Property["pricePerM2Basis"];
  sourcePricePerM2: string | null;
  description: string | null;
  zoning: string | null;
  verificationStatus: Property["verificationStatus"];
  source: Property["source"];
  isSynthetic: boolean;
  sourceUpdatedAt: string | null;
  importId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toPropertyDTO(p: Property): PropertyDTO {
  return {
    id: p.id,
    referenceCode: p.referenceCode,
    name: p.name,
    address: p.address,
    municipality: p.municipality,
    department: p.department,
    propertyType: p.propertyType,
    rawPropertyType: p.rawPropertyType,
    cadastralId: p.cadastralId,
    landAreaM2: decimalToString(p.landAreaM2),
    buildingAreaM2: decimalToString(p.buildingAreaM2),
    askingPriceUsd: decimalToString(p.askingPriceUsd),
    pricePerM2Usd: decimalToString(p.pricePerM2Usd),
    pricePerM2Basis: p.pricePerM2Basis,
    sourcePricePerM2: decimalToString(p.sourcePricePerM2),
    description: p.description,
    zoning: p.zoning,
    verificationStatus: p.verificationStatus,
    source: p.source,
    isSynthetic: p.isSynthetic,
    sourceUpdatedAt: p.sourceUpdatedAt?.toISOString() ?? null,
    importId: p.importId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
