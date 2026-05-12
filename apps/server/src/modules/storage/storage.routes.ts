import type { FastifyInstance } from "fastify";
import type { PairingService } from "../../services/pairingService";
import { requirePairToken } from "../../routes/auth";
import type { StorageManagerModule } from "./storage.service";
import type { AddStorageLocationInput, CreateStoragePoolInput, UpdateStoragePoolInput } from "./storage.types";
import { sendStorageError } from "./storage.controller";

export async function registerStorageRoutes(app: FastifyInstance, deps: {
  storageManager: StorageManagerModule;
  pairingService: PairingService;
}): Promise<void> {
  const auth = requirePairToken(deps.pairingService);
  const storage = deps.storageManager;

  app.get("/api/storage/capabilities", { preHandler: auth }, async () => ({
    capabilities: {
      single: true,
      pooledCapacity: true,
      mirrored: true,
      hybrid: false,
      rebalance: false
    }
  }));

  app.get("/api/storage/pools", { preHandler: auth }, async (_request, reply) => {
    try {
      return { pools: storage.pools.list() };
    } catch (error) {
      return sendStorageError(reply, error);
    }
  });

  app.post<{ Body: CreateStoragePoolInput }>("/api/storage/pools", { preHandler: auth }, async (request, reply) => {
    try {
      return reply.code(201).send(await storage.pools.create(request.body));
    } catch (error) {
      return sendStorageError(reply, error);
    }
  });

  app.get<{ Params: { id: string } }>("/api/storage/pools/:id", { preHandler: auth }, async (request, reply) => {
    try {
      return storage.pools.get(request.params.id);
    } catch (error) {
      return sendStorageError(reply, error);
    }
  });

  app.patch<{ Params: { id: string }; Body: UpdateStoragePoolInput }>(
    "/api/storage/pools/:id",
    { preHandler: auth },
    async (request, reply) => {
      try {
        return { pool: storage.pools.update(request.params.id, request.body ?? {}) };
      } catch (error) {
        return sendStorageError(reply, error);
      }
    }
  );

  app.delete<{ Params: { id: string } }>("/api/storage/pools/:id", { preHandler: auth }, async (request, reply) => {
    try {
      return storage.pools.disable(request.params.id);
    } catch (error) {
      return sendStorageError(reply, error);
    }
  });

  app.post<{ Params: { id: string }; Body: AddStorageLocationInput }>(
    "/api/storage/pools/:id/locations",
    { preHandler: auth },
    async (request, reply) => {
      try {
        return reply.code(201).send(await storage.pools.addLocation(request.params.id, request.body));
      } catch (error) {
        return sendStorageError(reply, error);
      }
    }
  );

  app.delete<{ Params: { id: string; locationId: string } }>(
    "/api/storage/pools/:id/locations/:locationId",
    { preHandler: auth },
    async (request, reply) => {
      try {
        return storage.pools.removeLocation(request.params.id, request.params.locationId);
      } catch (error) {
        return sendStorageError(reply, error);
      }
    }
  );

  app.get<{ Params: { id: string } }>("/api/storage/pools/:id/usage", { preHandler: auth }, async (request, reply) => {
    try {
      return storage.pools.usage(request.params.id);
    } catch (error) {
      return sendStorageError(reply, error);
    }
  });

  app.get<{ Params: { id: string } }>("/api/storage/pools/:id/health", { preHandler: auth }, async (request, reply) => {
    try {
      return storage.health.checkPool(request.params.id);
    } catch (error) {
      return sendStorageError(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>("/api/storage/pools/:id/rebalance", { preHandler: auth }, async (request, reply) => {
    try {
      return storage.rebalance.queue(request.params.id);
    } catch (error) {
      return sendStorageError(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>("/api/storage/pools/:id/rebalance/plan", { preHandler: auth }, async (request, reply) => {
    try {
      return storage.rebalance.plan(request.params.id);
    } catch (error) {
      return sendStorageError(reply, error);
    }
  });

  app.get("/api/storage/locations/detect", { preHandler: auth }, async (_request, reply) => {
    try {
      return { locations: await storage.locations.detectCandidates() };
    } catch (error) {
      return sendStorageError(reply, error);
    }
  });
}
