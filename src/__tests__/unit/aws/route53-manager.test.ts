/**
 * Route53 Manager Tests
 */

import { Route53Manager } from "../../../core/aws/route53-manager.js";
import { mockClient } from "aws-sdk-client-mock";
import {
  Route53Client,
  ListHostedZonesCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

const route53Mock = mockClient(Route53Client);

describe("Route53Manager", () => {
  beforeEach(() => {
    route53Mock.reset();
  });

  describe("constructor", () => {
    it("should create Route53 manager", () => {
      const manager = new Route53Manager();
      expect(manager).toBeInstanceOf(Route53Manager);
    });
  });

  describe("findHostedZone", () => {
    it("should return null when no hosted zones exist", async () => {
      route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [],
      });

      const manager = new Route53Manager();
      const result = await manager.findHostedZone("example.com");

      expect(result).toBeNull();
    });

    it("should find hosted zone by exact domain match", async () => {
      route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [
          {
            Id: "/hostedzone/Z123456789ABC",
            Name: "example.com.",
            CallerReference: "test-ref",
          },
        ],
      });

      const manager = new Route53Manager();
      const result = await manager.findHostedZone("example.com");

      expect(result).toEqual({
        Id: "/hostedzone/Z123456789ABC",
        Name: "example.com.",
      });
    });

    it("should find parent zone for subdomain", async () => {
      route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [
          {
            Id: "/hostedzone/Z123456789ABC",
            Name: "example.com.",
            CallerReference: "test-ref",
          },
        ],
      });

      const manager = new Route53Manager();
      const result = await manager.findHostedZone("www.example.com");

      expect(result).toEqual({
        Id: "/hostedzone/Z123456789ABC",
        Name: "example.com.",
      });
    });
  });

  describe("extractHostedZoneId", () => {
    it("should extract zone ID from full path", () => {
      const manager = new Route53Manager();
      const result = manager.extractHostedZoneId("/hostedzone/Z123456789ABC");

      expect(result).toBe("Z123456789ABC");
    });

    it("should return zone ID as-is if already extracted", () => {
      const manager = new Route53Manager();
      const result = manager.extractHostedZoneId("Z123456789ABC");

      expect(result).toBe("Z123456789ABC");
    });
  });

  describe("validateHostedZone", () => {
    it("should return zone ID when hosted zone exists", async () => {
      route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [
          {
            Id: "/hostedzone/Z123456789ABC",
            Name: "example.com.",
            CallerReference: "test-ref",
          },
        ],
      });

      const manager = new Route53Manager();
      const result = await manager.validateHostedZone("example.com");

      expect(result).toBe("/hostedzone/Z123456789ABC");
    });

    it("should auto create hosted zone when not found", async () => {
      route53Mock.on(ListHostedZonesCommand).resolves({ HostedZones: [] });
      route53Mock.on(CreateHostedZoneCommand).resolves({
        HostedZone: {
          Id: "/hostedzone/ZNEW123",
          Name: "example.com.",
          CallerReference: "test-ref",
        },
        DelegationSet: { NameServers: ["ns-1.awsdns.com", "ns-2.awsdns.net"] },
      });

      const manager = new Route53Manager();
      const result = await manager.validateHostedZone("example.com");

      expect(result).toBe("/hostedzone/ZNEW123");
    });

    it("should throw when auto creation fails", async () => {
      route53Mock.on(ListHostedZonesCommand).resolves({ HostedZones: [] });
      route53Mock.on(CreateHostedZoneCommand).rejects(new Error("boom"));

      const manager = new Route53Manager();

      await expect(manager.validateHostedZone("example.com")).rejects.toThrow(
        "Hosted zone creation failed"
      );
    });
  });
});
