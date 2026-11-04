import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Corre las migraciones reales en un Postgres embebido (sin Docker). Lo que en Supabase
// provee la plataforma (auth, storage, roles) se reemplaza por este stub mínimo.
const PLATFORM_STUB = `
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`;

const ANA = "00000000-0000-0000-0000-00000000000a";
const BETO = "00000000-0000-0000-0000-00000000000b";

let db: PGlite;

async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`set test.user_id = '${userId}'; set role authenticated;`);
  try {
    return await run();
  } finally {
    await db.exec(`reset role; set test.user_id = '';`);
  }
}

async function professionalId(userId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>("select id from public.professionals where user_id = $1", [userId]);
  return rows[0].id;
}

async function newClient(pid: string, name = "Cliente"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.clients (professional_id, name) values ($1, $2) returning id",
    [pid, name],
  );
  return rows[0].id;
}

async function newBudget(pid: string, clientId: string): Promise<{ id: string; number: number }> {
  const { rows } = await db.query<{ id: string; number: number }>(
    "insert into public.budgets (professional_id, client_id) values ($1, $2) returning id, number",
    [pid, clientId],
  );
  return rows[0];
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PLATFORM_STUB);
  const dir = join(__dirname, "..", "migrations");
  for (const file of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, file), "utf8"));
  // En Supabase estos permisos vienen por default privileges.
  await db.exec(`
    grant usage on schema public, auth, storage to authenticated;
    grant all on all tables in schema public to authenticated;
    grant all on storage.objects to authenticated;
    grant execute on all functions in schema public, auth, storage to authenticated;
    insert into auth.users (id, raw_user_meta_data) values
      ('${ANA}', '{"full_name": "Ana Gómez"}'), ('${BETO}', '{}');
  `);
});

describe("catálogo", () => {
  it("trae los 45 oficios, con unidad y descripción", async () => {
    const { rows } = await db.query<{ count: number; incomplete: number }>(`
      select count(*)::int as count,
             count(*) filter (where description = '' or unit = '')::int as incomplete
      from public.oficios where professional_id is null`);
    expect(rows[0]).toEqual({ count: 45, incomplete: 0 });
  });

  it("los oficios personalizados de un usuario no los ve otro", async () => {
    const ana = await professionalId(ANA);
    await asUser(ANA, () => db.query("insert into public.oficios (name, professional_id) values ('Afinador', $1)", [ana]));
    const { rows } = await asUser(BETO, () => db.query("select 1 from public.oficios where name = 'Afinador'"));
    expect(rows).toHaveLength(0);
  });

  it("nadie puede modificar el catálogo global", async () => {
    await asUser(ANA, () => db.query("update public.oficios set name = 'X' where name = 'Plomero'"));
    await asUser(ANA, () => db.query("delete from public.oficios where name = 'Plomero'"));
    const { rows } = await db.query("select 1 from public.oficios where name = 'Plomero'");
    expect(rows).toHaveLength(1);
    await expect(asUser(ANA, () => db.query("insert into public.oficios (name) values ('Falso global')"))).rejects.toThrow(/row-level security/);
  });
});

describe("alta de usuario", () => {
  it("crea su fila de profesional con el nombre de Google", async () => {
    const { rows } = await db.query<{ name: string; onboarded_at: string | null }>(
      "select name, onboarded_at from public.professionals where user_id = $1",
      [ANA],
    );
    expect(rows[0]).toEqual({ name: "Ana Gómez", onboarded_at: null });
  });
});

describe("aislamiento entre profesionales", () => {
  it("no se ven ni se editan datos ajenos", async () => {
    const ana = await professionalId(ANA);
    const clientId = await asUser(ANA, () => newClient(ana, "Privado"));

    const seen = await asUser(BETO, () => db.query("select 1 from public.clients where id = $1", [clientId]));
    expect(seen.rows).toHaveLength(0);
    const profiles = await asUser(BETO, () => db.query("select user_id from public.professionals"));
    expect(profiles.rows).toEqual([{ user_id: BETO }]);

    await asUser(BETO, () => db.query("update public.clients set name = 'Hackeado' where id = $1", [clientId]));
    await asUser(BETO, () => db.query("delete from public.clients where id = $1", [clientId]));
    const { rows } = await db.query<{ name: string }>("select name from public.clients where id = $1", [clientId]);
    expect(rows[0].name).toBe("Privado");
  });

  it("no se pueden crear filas a nombre de otro", async () => {
    const ana = await professionalId(ANA);
    await expect(asUser(BETO, () => newClient(ana))).rejects.toThrow(/row-level security/);
  });

  it("no se puede referenciar el cliente de otro aunque se conozca su id", async () => {
    const ana = await professionalId(ANA);
    const beto = await professionalId(BETO);
    const anaClient = await asUser(ANA, () => newClient(ana));
    await expect(asUser(BETO, () => newBudget(beto, anaClient))).rejects.toThrow(/foreign key/);
  });

  it("los ítems y fotos heredan el dueño del presupuesto y del trabajo", async () => {
    const ana = await professionalId(ANA);
    const clientId = await asUser(ANA, () => newClient(ana));
    const budget = await asUser(ANA, () => newBudget(ana, clientId));
    const { rows: jobs } = await asUser(ANA, () =>
      db.query<{ id: string }>("insert into public.jobs (budget_id, professional_id) values ($1, $2) returning id", [budget.id, ana]),
    );

    await expect(
      asUser(BETO, () => db.query("insert into public.budget_items (budget_id, type) values ($1, 'labor')", [budget.id])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(BETO, () => db.query("insert into public.job_photos (job_id, url) values ($1, 'x')", [jobs[0].id])),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("numeración de presupuestos", () => {
  it("es correlativa y por profesional", async () => {
    await db.exec("insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d')");
    const carla = "00000000-0000-0000-0000-00000000000c";
    const dani = "00000000-0000-0000-0000-00000000000d";
    const pc = await professionalId(carla);
    const pd = await professionalId(dani);
    const cc = await asUser(carla, () => newClient(pc));
    const cd = await asUser(dani, () => newClient(pd));

    expect((await asUser(carla, () => newBudget(pc, cc))).number).toBe(1);
    expect((await asUser(carla, () => newBudget(pc, cc))).number).toBe(2);
    expect((await asUser(dani, () => newBudget(pd, cd))).number).toBe(1);
  });

  it("editar con upsert (como hace la sync) no quema correlativos", async () => {
    const user = "00000000-0000-0000-0000-00000000000e";
    await db.exec(`insert into auth.users (id) values ('${user}')`);
    const pid = await professionalId(user);
    const clientId = await asUser(user, () => newClient(pid));
    const first = await asUser(user, () => newBudget(pid, clientId));

    await asUser(user, () =>
      db.query(
        `insert into public.budgets (id, professional_id, client_id, number, total) values ($1, $2, $3, $4, 100)
         on conflict (id) do update set total = excluded.total`,
        [first.id, pid, clientId, first.number],
      ),
    );

    expect((await asUser(user, () => newBudget(pid, clientId))).number).toBe(2);
  });

  it("no se puede borrar un cliente con presupuestos ni un presupuesto con trabajo", async () => {
    const ana = await professionalId(ANA);
    const clientId = await asUser(ANA, () => newClient(ana));
    const budget = await asUser(ANA, () => newBudget(ana, clientId));
    await asUser(ANA, () => db.query("insert into public.jobs (budget_id, professional_id) values ($1, $2)", [budget.id, ana]));

    await expect(asUser(ANA, () => db.query("delete from public.clients where id = $1", [clientId]))).rejects.toThrow(/foreign key/);
    await expect(asUser(ANA, () => db.query("delete from public.budgets where id = $1", [budget.id]))).rejects.toThrow(/foreign key/);
  });

  it("valida IVA y estado", async () => {
    const ana = await professionalId(ANA);
    const clientId = await asUser(ANA, () => newClient(ana));
    await expect(
      asUser(ANA, () => db.query("insert into public.budgets (professional_id, client_id, iva_percent) values ($1, $2, 15)", [ana, clientId])),
    ).rejects.toThrow(/check/);
  });
});

describe("storage", () => {
  it("define los tres buckets, con pdfs y fotos privados", async () => {
    const { rows } = await db.query<{ id: string; public: boolean; file_size_limit: string }>(
      "select id, public, file_size_limit::text from storage.buckets order by id",
    );
    expect(rows).toEqual([
      { id: "job-photos", public: false, file_size_limit: "10485760" },
      { id: "logos", public: true, file_size_limit: "2097152" },
      { id: "pdfs", public: false, file_size_limit: "10485760" },
    ]);
  });

  it("cada usuario solo escribe y lee bajo su carpeta", async () => {
    await asUser(ANA, () => db.query("insert into storage.objects (bucket_id, name) values ('pdfs', $1)", [`${ANA}/b/doc.pdf`]));
    await expect(
      asUser(BETO, () => db.query("insert into storage.objects (bucket_id, name) values ('pdfs', $1)", [`${ANA}/b/falso.pdf`])),
    ).rejects.toThrow(/row-level security/);
    const { rows } = await asUser(BETO, () => db.query("select 1 from storage.objects where name = $1", [`${ANA}/b/doc.pdf`]));
    expect(rows).toHaveLength(0);
  });
});
