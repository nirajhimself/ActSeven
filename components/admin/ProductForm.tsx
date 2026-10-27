"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { addColourAction, saveProductAction, uploadImageAction } from "@/app/admin/products/actions";
import { shrinkImage } from "@/lib/shrink-image";
import type { FieldErrors } from "@/lib/server/admin-products";

export type EditableProduct = {
  id: number | null;
  name: string;
  slug: string;
  categoryId: number | null;
  price: number | null;
  status: string;
  featured: boolean;
  isNew: boolean;
  summary: string;
  description: string;
  highlights: string[];
  fabric: string;
  fit: string;
  care: string[];
  styles: string[];
  campaigns: string[];
  sizeSystem: string;
  colourIds: number[];
  images: { url: string; alt: string; position: string | null }[];
  variants: { id: number; sku: string; colour: string; hex: string; size: string; active: boolean; priceOverride: number | null; stock: number }[];
};

type Options = {
  categories: { id: number; name: string }[];
  colours: { id: number; name: string; hex: string }[];
  statuses: readonly string[];
  styles: readonly string[];
  campaigns: readonly { value: string; label: string }[];
  sizeSystems: readonly { value: string; label: string }[];
};

const field = "block min-h-11 w-full border border-obsidian/20 bg-ivory px-3 text-sm outline-none focus:border-obsidian aria-invalid:border-[#9b2c1f]";
const IMAGE_SLOTS = 8;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="mt-1 text-[0.6875rem] text-taupe">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-[#9b2c1f]">{error}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-obsidian/10 pt-6">
      <legend className="display -mt-0.5 mb-2 text-2xl">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ProductForm({ product, options }: { product: EditableProduct; options: Options }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();
  const [slug, setSlug] = useState(product.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(product.id));
  const urlInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [images, setImages] = useState(() =>
    Array.from({ length: IMAGE_SLOTS }, (_, i) => product.images[i] ?? { url: "", alt: "", position: null }),
  );
  const isNew = product.id === null;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveProductAction(data);
      if (res?.errors) {
        setErrors(res.errors);
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[role=alert]")?.focus());
      }
    });
  };

  const errorList = Object.entries(errors).filter(([, v]) => v);

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-10" noValidate>
      {product.id ? <input type="hidden" name="productId" value={product.id} /> : null}

      {errorList.length ? (
        <div role="alert" tabIndex={-1} className="border border-[#9b2c1f]/40 bg-[#9b2c1f]/5 px-4 py-3 text-sm text-[#9b2c1f] outline-none">
          <p className="font-medium">Please fix the following:</p>
          <ul className="mt-1 list-disc pl-5">
            {errorList.map(([k, v]) => (
              <li key={k}>{v}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Section title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name}>
            {(id) => (
              <input
                id={id}
                name="name"
                required
                defaultValue={product.name}
                aria-invalid={Boolean(errors.name)}
                onChange={(e) => !slugTouched && setSlug(slugify(e.target.value))}
                className={field}
              />
            )}
          </Field>
          <Field label="URL slug" error={errors.slug} hint={isNew ? "The product's address: /products/your-slug" : "Changing this changes the product's URL."}>
            {(id) => (
              <input
                id={id}
                name="slug"
                required
                value={slug}
                aria-invalid={Boolean(errors.slug)}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                className={field}
              />
            )}
          </Field>
          <Field label="Category" error={errors.categoryId}>
            {(id) => (
              <select id={id} name="categoryId" defaultValue={product.categoryId ?? ""} aria-invalid={Boolean(errors.categoryId)} className={`${field} cursor-pointer`}>
                <option value="" disabled>
                  Choose a category
                </option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Price (₹, incl. GST)" error={errors.price}>
            {(id) => <input id={id} name="price" inputMode="numeric" defaultValue={product.price ?? ""} aria-invalid={Boolean(errors.price)} className={field} />}
          </Field>
          <Field label="Status" error={errors.status} hint="Only active products appear in the store.">
            {(id) => (
              <select id={id} name="status" defaultValue={product.status} className={`${field} cursor-pointer`}>
                {options.statuses.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="flex flex-wrap items-end gap-6 pb-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="featured" defaultChecked={product.featured} className="size-4 accent-obsidian" /> Featured
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isNew" defaultChecked={product.isNew} className="size-4 accent-obsidian" /> New arrival
            </label>
          </div>
        </div>
      </Section>

      <Section title="Copy">
        <Field label="Summary (one line)" error={errors.summary}>
          {(id) => <input id={id} name="summary" maxLength={200} defaultValue={product.summary} aria-invalid={Boolean(errors.summary)} className={field} />}
        </Field>
        <Field label="Description" error={errors.description}>
          {(id) => (
            <textarea id={id} name="description" rows={4} maxLength={4000} defaultValue={product.description} aria-invalid={Boolean(errors.description)} className={`${field} py-2.5`} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Highlights" hint="One per line, up to 8. Only facts you can stand behind.">
            {(id) => <textarea id={id} name="highlights" rows={4} defaultValue={product.highlights.join("\n")} className={`${field} py-2.5`} />}
          </Field>
          <Field label="Care" hint="One instruction per line.">
            {(id) => <textarea id={id} name="care" rows={4} defaultValue={product.care.join("\n")} className={`${field} py-2.5`} />}
          </Field>
          <Field label="Fabric">{(id) => <input id={id} name="fabric" maxLength={300} defaultValue={product.fabric} className={field} />}</Field>
          <Field label="Fit">{(id) => <input id={id} name="fit" maxLength={300} defaultValue={product.fit} className={field} />}</Field>
        </div>
      </Section>

      <Section title="Merchandising">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs">Style (for filters)</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {options.styles.map((s) => (
                <label key={s} className="flex items-center gap-2">
                  <input type="checkbox" name="styles" value={s} defaultChecked={product.styles.includes(s)} className="size-4 accent-obsidian" />
                  {s[0].toUpperCase() + s.slice(1)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs">Collections</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {options.campaigns.map((c) => (
                <label key={c.value} className="flex items-center gap-2">
                  <input type="checkbox" name="campaigns" value={c.value} defaultChecked={product.campaigns.includes(c.value)} className="size-4 accent-obsidian" />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Sizes & colours">
        <Field label="Size range" error={errors.sizeSystem} hint="Every colour is offered in every size of the range; switch individual variants off below.">
          {(id) => (
            <select id={id} name="sizeSystem" defaultValue={product.sizeSystem} className={`${field} cursor-pointer sm:max-w-xs`}>
              {options.sizeSystems.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div>
          <p className="mb-2 text-xs">Colours</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {options.colours.map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input type="checkbox" name="colourIds" value={c.id} defaultChecked={product.colourIds.includes(c.id)} className="size-4 accent-obsidian" />
                <span aria-hidden="true" className="size-3.5 rounded-full ring-1 ring-obsidian/20" style={{ backgroundColor: c.hex }} />
                {c.name}
              </label>
            ))}
          </div>
          {errors.colourIds ? <p className="mt-1 text-xs text-[#9b2c1f]">{errors.colourIds}</p> : null}
          <AddColour />
        </div>
      </Section>

      <Section title="Images">
        <p className="text-xs text-taupe">
          Upload a photo from your device, or paste an https:// image URL. The first image is the main one. Focal point (optional) keeps the subject in frame when cropped, e.g. <code>50% 20%</code>.
        </p>
        {errors.images ? <p className="text-xs text-[#9b2c1f]">{errors.images}</p> : null}
        <ol className="space-y-3">
          {images.map((img, i) => (
            <li key={i} className="grid items-start gap-3 sm:grid-cols-[3.5rem_2fr_2fr_7rem]">
              <div className="hidden aspect-[4/5] overflow-hidden bg-bone sm:block">
                {img.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary URL
                  <img src={img.url} alt="" className="size-full object-cover" style={{ objectPosition: img.position ?? undefined }} />
                ) : null}
              </div>
              <div>
                <input
                  ref={(el) => {
                    urlInputs.current[i] = el;
                  }}
                  name={`image.${i}.url`}
                  aria-label={`Image ${i + 1} URL`}
                  placeholder={i === 0 ? "Main image URL" : `Image ${i + 1} URL (optional)`}
                  defaultValue={img.url}
                  onBlur={(e) => setImages((list) => list.map((x, j) => (j === i ? { ...x, url: e.target.value.trim() } : x)))}
                  className={field}
                />
                <ImageUpload
                  label={`Image ${i + 1}`}
                  onUploaded={(url) => {
                    const input = urlInputs.current[i];
                    if (input) input.value = url;
                    setImages((list) => list.map((x, j) => (j === i ? { ...x, url } : x)));
                  }}
                />
              </div>
              <input name={`image.${i}.alt`} aria-label={`Image ${i + 1} alt text`} placeholder="Alt text: what the photo shows" defaultValue={img.alt} className={field} />
              <input
                name={`image.${i}.position`}
                aria-label={`Image ${i + 1} focal point`}
                placeholder="50% 30%"
                defaultValue={img.position ?? ""}
                onBlur={(e) => setImages((list) => list.map((x, j) => (j === i ? { ...x, position: e.target.value.trim() || null } : x)))}
                className={field}
              />
            </li>
          ))}
        </ol>
      </Section>

      {product.variants.length ? (
        <Section title="Variants">
          <p className="text-xs text-taupe">
            Set the stock for each colour and size here or on the Inventory page. A blank price uses the product price. Switched-off variants
            can&apos;t be bought.
          </p>
          {errors.variants ? <p className="text-xs text-[#9b2c1f]">{errors.variants}</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b border-obsidian/20 text-xs text-taupe">
                  <th className="py-2 pr-3 font-normal">SKU</th>
                  <th className="py-2 pr-3 font-normal">Colour / size</th>
                  <th className="py-2 pr-3 text-right font-normal">Stock</th>
                  <th className="py-2 pr-3 font-normal">Price override (₹)</th>
                  <th className="py-2 font-normal">On sale</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((v) => (
                  <tr key={v.id} className={`border-b border-obsidian/10 ${v.active ? "" : "text-taupe"}`}>
                    <td className="py-1.5 pr-3 font-mono text-xs">{v.sku}</td>
                    <td className="py-1.5 pr-3">
                      <span aria-hidden="true" className="mr-2 inline-block size-3 rounded-full align-middle ring-1 ring-obsidian/20" style={{ backgroundColor: v.hex }} />
                      {v.colour} / {v.size}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <input type="hidden" name={`orig:${v.id}`} value={v.stock} />
                      <input
                        name={`stock:${v.id}`}
                        type="number"
                        min={0}
                        max={100000}
                        step={1}
                        inputMode="numeric"
                        defaultValue={v.stock}
                        aria-label={`Stock for ${v.colour} / ${v.size}`}
                        className="h-9 w-20 border border-obsidian/20 bg-ivory px-2 text-right text-sm tabular-nums outline-none focus:border-obsidian"
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="hidden" name={`variant.${v.id}.present`} value="1" />
                      <input
                        name={`variant.${v.id}.price`}
                        inputMode="numeric"
                        defaultValue={v.priceOverride ?? ""}
                        aria-label={`Price override for ${v.sku}`}
                        className="h-9 w-28 border border-obsidian/20 bg-ivory px-2 text-sm tabular-nums outline-none focus:border-obsidian"
                      />
                    </td>
                    <td className="py-1.5">
                      <input type="checkbox" name={`variant.${v.id}.active`} defaultChecked={v.active} aria-label={`${v.sku} on sale`} className="size-4 accent-obsidian" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : (
        <p className="text-xs text-taupe">Variants (one per colour and size) are created when you save, with zero stock; set each one&apos;s stock here after saving.</p>
      )}

      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-4 border-t border-obsidian/10 bg-ivory/95 px-5 py-4 backdrop-blur md:mx-0 md:px-0">
        <button type="submit" disabled={pending} className="label min-h-12 bg-obsidian px-8 text-ivory hover:bg-graphite disabled:opacity-45">
          {pending ? "Saving…" : isNew ? "Create product" : "Save changes"}
        </button>
        {errors.form ? <span className="text-xs text-[#9b2c1f]">{errors.form}</span> : null}
      </div>
    </form>
  );
}

/** Adds a colour to the shared palette (a separate small form inside the product form's flow). */
function AddColour() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const hexRef = useRef<HTMLInputElement>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-xs underline underline-offset-4">
        Add a colour to the palette
      </button>
    );
  }
  const add = () => {
    const data = new FormData();
    data.set("name", nameRef.current?.value ?? "");
    data.set("hex", hexRef.current?.value ?? "");
    startTransition(async () => {
      const res = await addColourAction(data);
      setMessage(res.ok ? "Added — tick it above to use it." : (res.error ?? "Couldn't add the colour."));
    });
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input ref={nameRef} aria-label="New colour name" placeholder="Name, e.g. Sage" className="h-9 w-40 border border-obsidian/20 bg-ivory px-2 text-sm" />
      <input ref={hexRef} type="color" defaultValue="#8a9a7b" aria-label="New colour" className="h-9 w-12 cursor-pointer border border-obsidian/20 bg-ivory" />
      <button type="button" onClick={add} disabled={pending} className="label h-9 border border-obsidian/60 px-4 hover:bg-obsidian hover:text-ivory disabled:opacity-45">
        {pending ? "Adding…" : "Add"}
      </button>
      {message ? <span role="status" className="text-xs text-taupe">{message}</span> : null}
    </div>
  );
}

/** "Upload photo": shrinks the chosen photo in the browser, stores it, and hands back its URL. */
function ImageUpload({ label, onUploaded }: { label: string; onUploaded: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const upload = (file: File) =>
    startTransition(async () => {
      setError(null);
      const data = new FormData();
      data.set("file", await shrinkImage(file), file.name);
      const res = await uploadImageAction(data).catch(() => ({ ok: false as const, error: "The photo couldn't be uploaded. Please try again." }));
      if (res.ok) onUploaded(res.url);
      else setError(res.error);
    });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        aria-label={`${label}: upload a photo`}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={pending} className="text-xs underline underline-offset-4 disabled:opacity-45">
        {pending ? "Uploading…" : "Upload photo"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-[#9b2c1f]">
          {error}
        </span>
      ) : null}
    </div>
  );
}
