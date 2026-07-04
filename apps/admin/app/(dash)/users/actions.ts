"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { createUserSchema } from "@signex/shared";

export async function createUser(fd: FormData): Promise<void> {
  await requireRole("ADMIN");
  const parsed = createUserSchema.safeParse({
    username: String(fd.get("username") ?? ""),
    name: String(fd.get("name") ?? ""),
    role: String(fd.get("role") ?? "EDITOR"),
    password: String(fd.get("password") ?? ""),
  });
  if (!parsed.success) return; // affordance-only; api is the hard validator (422)
  await apiServer("/api/users", { method: "POST", body: parsed.data });
  revalidatePath("/users");
}

export async function updateUserRole(fd: FormData): Promise<void> {
  await requireRole("ADMIN");
  await apiServer(`/api/users/${String(fd.get("id"))}`, {
    method: "PATCH",
    body: { role: String(fd.get("role") ?? "EDITOR") },
  });
  revalidatePath("/users");
}

export async function deactivateUser(fd: FormData): Promise<void> {
  await requireRole("ADMIN");
  await apiServer(`/api/users/${String(fd.get("id"))}`, { method: "DELETE" });
  revalidatePath("/users");
}

export async function reactivateUser(fd: FormData): Promise<void> {
  await requireRole("ADMIN");
  await apiServer(`/api/users/${String(fd.get("id"))}`, {
    method: "PATCH",
    body: { isActive: true },
  });
  revalidatePath("/users");
}
