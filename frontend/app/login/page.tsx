"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { login } from "@/services/api";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email: z.string().email("Ingresa un correo válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { email: 'admin@demo.com', password: 'password' } });

  return (
    <div className="grid-pattern flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.35),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.18),transparent_30%)]" />
      <Card className="relative z-10 w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/18 text-xl font-semibold text-indigo-200">MR</div>
          <h1 className="mt-4 text-3xl font-semibold">Mueblería Rene</h1>
          <p className="mt-2 text-sm text-zinc-400">Accede al dashboard comercial y visor paramétrico.</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            try {
              setFormError("");
              const user = await login(values.email, values.password);
              setUser(user as never);
              router.push('/dashboard');
            } catch (error) {
              setFormError(error instanceof Error ? error.message : 'No fue posible iniciar sesión');
            }
          })}
        >
          <div className="space-y-2">
            <label className="text-sm text-zinc-300">Email</label>
            <Input {...register('email')} placeholder="admin@demo.com" />
            {errors.email && <p className="text-sm text-rose-300">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm text-zinc-300">Password</label>
            <Input type="password" {...register('password')} placeholder="password" />
            {errors.password && <p className="text-sm text-rose-300">{errors.password.message}</p>}
          </div>
          {formError && <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{formError}</p>}
          <Button className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Ingresando...' : 'Entrar al estudio'}</Button>
        </form>
        <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/4 p-4 text-sm text-zinc-400">
          <div>Admin: <span className="text-white">admin@demo.com / password</span></div>
          <div>Seller: <span className="text-white">seller@demo.com / password</span></div>
        </div>
      </Card>
    </div>
  );
}
