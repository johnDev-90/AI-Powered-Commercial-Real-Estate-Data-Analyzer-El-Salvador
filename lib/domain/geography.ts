import { normalizeText } from "./text";

/**
 * Reference geography for El Salvador.
 *
 * Since May 2024 (Ley Especial para la Reestructuración Municipal) El Salvador has 44
 * municipalities; the 262 former municipalities are now districts (distritos). Listings
 * still commonly use the former names (e.g. "Santa Tecla"), so both are accepted here.
 *
 * Limitations: the district lists are complete only for the departments marked
 * `complete: true`. Values not found are reported as "not in the reference list —
 * verify", never as definitively invalid. Verify against official sources before
 * relying on this list.
 */
export interface DepartmentReference {
  name: string;
  /** 2024 municipalities. */
  municipalities: string[];
  /** Former municipalities, now districts. */
  districts: string[];
  /** Whether the district list is complete for this department. */
  complete: boolean;
}

export const DEPARTMENTS: DepartmentReference[] = [
  {
    name: "San Salvador",
    municipalities: ["San Salvador Centro", "San Salvador Norte", "San Salvador Sur", "San Salvador Este", "San Salvador Oeste"],
    districts: [
      "Aguilares", "Apopa", "Ayutuxtepeque", "Ciudad Delgado", "Cuscatancingo", "El Paisnal", "Guazapa", "Ilopango",
      "Mejicanos", "Nejapa", "Panchimalco", "Rosario de Mora", "San Marcos", "San Martín", "San Salvador",
      "Santiago Texacuangos", "Santo Tomás", "Soyapango", "Tonacatepeque",
    ],
    complete: true,
  },
  {
    name: "La Libertad",
    municipalities: ["La Libertad Centro", "La Libertad Costa", "La Libertad Este", "La Libertad Norte", "La Libertad Oeste", "La Libertad Sur"],
    districts: [
      "Antiguo Cuscatlán", "Chiltiupán", "Ciudad Arce", "Colón", "Comasagua", "Huizúcar", "Jayaque", "Jicalapa",
      "La Libertad", "Nuevo Cuscatlán", "Quezaltepeque", "Sacacoyo", "San José Villanueva", "San Juan Opico",
      "San Matías", "San Pablo Tacachico", "Santa Tecla", "Talnique", "Tamanique", "Teotepeque", "Tepecoyo", "Zaragoza",
    ],
    complete: true,
  },
  {
    name: "Santa Ana",
    municipalities: ["Santa Ana Centro", "Santa Ana Este", "Santa Ana Norte", "Santa Ana Oeste"],
    districts: [
      "Candelaria de la Frontera", "Chalchuapa", "Coatepeque", "El Congo", "El Porvenir", "Masahuat", "Metapán",
      "San Antonio Pajonal", "San Sebastián Salitrillo", "Santa Ana", "Santa Rosa Guachipilín", "Santiago de la Frontera",
      "Texistepeque",
    ],
    complete: true,
  },
  {
    name: "San Miguel",
    municipalities: ["San Miguel Centro", "San Miguel Norte", "San Miguel Oeste"],
    districts: [
      "Carolina", "Chapeltique", "Chinameca", "Chirilagua", "Ciudad Barrios", "Comacarán", "El Tránsito", "Lolotique",
      "Moncagua", "Nueva Guadalupe", "Nuevo Edén de San Juan", "Quelepa", "San Antonio del Mosco", "San Gerardo",
      "San Jorge", "San Luis de la Reina", "San Miguel", "San Rafael Oriente", "Sesori", "Uluazapa",
    ],
    complete: true,
  },
  {
    name: "Sonsonate",
    municipalities: ["Sonsonate Centro", "Sonsonate Este", "Sonsonate Norte", "Sonsonate Oeste"],
    districts: ["Acajutla", "Armenia", "Izalco", "Juayúa", "Nahuizalco", "San Antonio del Monte", "Sonsonate", "Sonzacate"],
    complete: false,
  },
  {
    name: "La Paz",
    municipalities: ["La Paz Centro", "La Paz Este", "La Paz Oeste"],
    districts: ["Olocuilta", "San Juan Nonualco", "San Luis Talpa", "San Pedro Masahuat", "Santiago Nonualco", "Zacatecoluca"],
    complete: false,
  },
  {
    name: "Usulután",
    municipalities: ["Usulután Este", "Usulután Norte", "Usulután Oeste"],
    districts: ["Jiquilisco", "Santiago de María", "Usulután"],
    complete: false,
  },
  {
    name: "La Unión",
    municipalities: ["La Unión Norte", "La Unión Sur"],
    districts: ["Conchagua", "La Unión", "Santa Rosa de Lima"],
    complete: false,
  },
  {
    name: "Cuscatlán",
    municipalities: ["Cuscatlán Norte", "Cuscatlán Sur"],
    districts: ["Cojutepeque", "San Rafael Cedros", "Suchitoto"],
    complete: false,
  },
  {
    name: "Ahuachapán",
    municipalities: ["Ahuachapán Centro", "Ahuachapán Norte", "Ahuachapán Sur"],
    districts: ["Ahuachapán", "Apaneca", "Atiquizaya", "Concepción de Ataco", "Tacuba"],
    complete: false,
  },
  { name: "Chalatenango", municipalities: ["Chalatenango Centro", "Chalatenango Norte", "Chalatenango Sur"], districts: ["Chalatenango"], complete: false },
  { name: "Cabañas", municipalities: ["Cabañas Este", "Cabañas Oeste"], districts: ["Ilobasco", "Sensuntepeque"], complete: false },
  { name: "Morazán", municipalities: ["Morazán Norte", "Morazán Sur"], districts: ["San Francisco Gotera"], complete: false },
  { name: "San Vicente", municipalities: ["San Vicente Norte", "San Vicente Sur"], districts: ["San Vicente"], complete: false },
];

const departmentByKey = new Map(DEPARTMENTS.map((d) => [normalizeText(d.name), d]));

/** Index of normalized locality (municipality or district) → departments containing it. */
const localityIndex = new Map<string, DepartmentReference[]>();
for (const dept of DEPARTMENTS) {
  for (const name of [...dept.municipalities, ...dept.districts]) {
    const key = normalizeText(name);
    localityIndex.set(key, [...(localityIndex.get(key) ?? []), dept]);
  }
}

const canonicalLocality = new Map<string, string>();
for (const dept of DEPARTMENTS) {
  for (const name of [...dept.municipalities, ...dept.districts]) canonicalLocality.set(normalizeText(name), name);
}

export function findDepartment(name: string | null | undefined): DepartmentReference | null {
  if (!name) return null;
  return departmentByKey.get(normalizeText(name.replace(/^departamento de\s+/i, ""))) ?? null;
}

/** Canonical spelling (with accents) of a known department, or null. */
export function canonicalDepartment(name: string | null | undefined): string | null {
  return findDepartment(name)?.name ?? null;
}

/** Canonical spelling of a known municipality/district, or null. */
export function canonicalMunicipality(name: string | null | undefined): string | null {
  if (!name) return null;
  return canonicalLocality.get(normalizeText(name)) ?? null;
}

export type LocationCheck =
  | { status: "ok" }
  | { status: "unknown_department" }
  | { status: "mismatch"; expectedDepartments: string[] }
  | { status: "unknown_locality"; departmentListComplete: boolean };

/** Deterministic department ↔ municipality consistency check. */
export function checkLocation(municipality: string, department: string): LocationCheck {
  const dept = findDepartment(department);
  if (!dept) return { status: "unknown_department" };
  const matches = localityIndex.get(normalizeText(municipality));
  if (!matches) return { status: "unknown_locality", departmentListComplete: dept.complete };
  if (matches.some((m) => m.name === dept.name)) return { status: "ok" };
  return { status: "mismatch", expectedDepartments: matches.map((m) => m.name) };
}
