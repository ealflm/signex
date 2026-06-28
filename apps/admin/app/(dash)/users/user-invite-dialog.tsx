"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { UserPlus } from "lucide-react";
import type { RoleName } from "@signex/shared";
import { createUser } from "./actions";
import { Field } from "@/components/admin/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ROLE_LABEL: Record<RoleName, string> = {
  EDITOR: "Editor",
  PUBLISHER: "Publisher",
  ADMIN: "Admin",
};
const ROLES: RoleName[] = ["EDITOR", "PUBLISHER", "ADMIN"];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add user"}
    </Button>
  );
}

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" />
          Add user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Create an account that can sign in to this admin. Share the temporary password with them.
          </DialogDescription>
        </DialogHeader>

        <form
          action={async (fd) => {
            await createUser(fd);
            setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Email" htmlFor="invite-email" required>
            <Input
              id="invite-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="person@signex.vn"
              required
            />
          </Field>

          <Field label="Name" htmlFor="invite-name" required>
            <Input id="invite-name" name="name" type="text" placeholder="Full name" required />
          </Field>

          <Field label="Role" htmlFor="invite-role">
            <Select name="role" defaultValue="EDITOR">
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Temporary password"
            htmlFor="invite-password"
            hint="At least 8 characters"
            required
          >
            <Input
              id="invite-password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              minLength={8}
              required
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
