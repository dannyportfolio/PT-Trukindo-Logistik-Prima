import { describe, it, expect } from "vitest";
import {
  TRUKINDO_PROFILE,
  getVerifiedFact,
  getPublicServices,
  getPublicScenarios,
  getScenarioById,
} from "@/lib/content/trukindo-config";

describe("Content Integrity & Fact-Gating Store: Trukindo Logistics", () => {
  it("should quarantine unverified corporate facts with status NEEDS_VERIFICATION", () => {
    expect(TRUKINDO_PROFILE.foundingYear.status).toBe("NEEDS_VERIFICATION");
    expect(TRUKINDO_PROFILE.fleetSizeCount.status).toBe("NEEDS_VERIFICATION");
    expect(TRUKINDO_PROFILE.ownedWarehousesCount.status).toBe("NEEDS_VERIFICATION");
    expect(TRUKINDO_PROFILE.clientLogos.status).toBe("NEEDS_VERIFICATION");
    expect(TRUKINDO_PROFILE.certifications.status).toBe("NEEDS_VERIFICATION");
  });

  it("should return safe fallback and suppress unverified facts through getVerifiedFact", () => {
    const safeFoundingText = getVerifiedFact(
      TRUKINDO_PROFILE.foundingYear,
      "Didukung tim berpengalaman di industri transportasi logistik nasional"
    );
    expect(safeFoundingText).toBe(
      "Didukung tim berpengalaman di industri transportasi logistik nasional"
    );

    const safeFleetText = getVerifiedFact(
      TRUKINDO_PROFILE.fleetSizeCount,
      "Armada beragam dari truk ringan hingga berat siap melayani berbagai kebutuhan muatan"
    );
    expect(safeFleetText).toBe(
      "Armada beragam dari truk ringan hingga berat siap melayani berbagai kebutuhan muatan"
    );

    const safeWarehouses = getVerifiedFact(
      TRUKINDO_PROFILE.ownedWarehousesCount,
      "Layanan pengangkutan point-to-point langsung dari fasilitas pengirim ke penerima"
    );
    expect(safeWarehouses).toBe(
      "Layanan pengangkutan point-to-point langsung dari fasilitas pengirim ke penerima"
    );
  });

  it("should only return confirmed services for public rendering", () => {
    const publicServices = getPublicServices();
    expect(publicServices.length).toBeGreaterThanOrEqual(3);

    for (const service of publicServices) {
      expect(service.status).toBe("VERIFIED");
    }

    // Unconfirmed services must NOT be in public services
    const serviceIds = publicServices.map((s) => s.id);
    expect(serviceIds).toContain("ftl-trucking");
    expect(serviceIds).toContain("scheduled-linehaul");
    expect(serviceIds).toContain("contract-logistics");
    expect(serviceIds).not.toContain("cold-chain");
    expect(serviceIds).not.toContain("customs-clearance");
    expect(serviceIds).not.toContain("cross-docking");
  });

  it("should provide valid industry standard truck specifications without claiming asset ownership count", () => {
    expect(TRUKINDO_PROFILE.truckClasses.length).toBeGreaterThanOrEqual(5);

    for (const truck of TRUKINDO_PROFILE.truckClasses) {
      expect(truck.name).toBeDefined();
      expect(truck.maxPayloadTon).toBeDefined();
      expect(truck.approxVolumeCbm).toBeDefined();
      expect(truck.typicalDimensions).toBeDefined();
      expect(truck.imageSrc).toBeDefined();
      expect(truck.imageAlt).toBeDefined();
    }
  });

  it("should return authentic Indonesian logistics scenarios strictly flagged as conceptual simulations", () => {
    const scenarios = getPublicScenarios();
    expect(scenarios.length).toBe(5);

    const scenarioIds = scenarios.map((s) => s.id);
    expect(scenarioIds).toContain("fmcg-distribution");
    expect(scenarioIds).toContain("manufacturing-parts");
    expect(scenarioIds).toContain("construction-materials");
    expect(scenarioIds).toContain("interisland-shipping");
    expect(scenarioIds).toContain("dedicated-contract");

    for (const scenario of scenarios) {
      expect(scenario.status).toBe("VERIFIED");
      expect(scenario.isConceptualSimulation).toBe(true);
      expect(scenario.title).toBeDefined();
      expect(scenario.narrative).toBeDefined();
      expect(scenario.illustrativeVehicle).toBeDefined();
      expect(scenario.originDestination).toBeDefined();
      expect(scenario.imageSrc).toMatch(/^\/images\/scenarios\//);
      expect(scenario.keyConsiderations.length).toBeGreaterThanOrEqual(3);
      expect(scenario.quotePrefill).toBeDefined();
      expect(scenario.quotePrefill.serviceCategory).toBeDefined();
      expect(scenario.quotePrefill.cargoType).toBeDefined();
    }
  });

  it("should successfully lookup scenario by ID for quotation prefill", () => {
    const fmcg = getScenarioById("fmcg-distribution");
    expect(fmcg).toBeDefined();
    expect(fmcg?.title).toBe("Distribusi FMCG Antarkota");
    expect(fmcg?.quotePrefill.cargoType).toBe("FMCG_CONSUMER_GOODS");
    expect(fmcg?.quotePrefill.truckType).toBe("CDD_DOUBLE");

    const nonExistent = getScenarioById("non-existent-scenario");
    expect(nonExistent).toBeUndefined();
  });
});

