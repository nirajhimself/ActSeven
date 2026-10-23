import { indianStates, normalisePhone } from "./india";

export type AddressFields = {
  name: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Server-side validation for an Indian delivery address. Phone is normalised to +91XXXXXXXXXX. */
export function validateAddress(raw: Partial<Record<keyof AddressFields, unknown>>) {
  const f: AddressFields = {
    name: str(raw.name, 120),
    phone: str(raw.phone, 20),
    address1: str(raw.address1, 200),
    address2: str(raw.address2, 200),
    city: str(raw.city, 80),
    state: str(raw.state, 80),
    pincode: str(raw.pincode, 6),
  };
  const errors: Partial<Record<keyof AddressFields, string>> = {};
  const phone = normalisePhone(f.phone);
  if (f.name.length < 2) errors.name = "Enter your full name.";
  if (!phone) errors.phone = "Enter a 10-digit Indian mobile number.";
  if (f.address1.length < 5) errors.address1 = "Enter your street address.";
  if (f.city.length < 2) errors.city = "Enter your city.";
  if (!(indianStates as readonly string[]).includes(f.state)) errors.state = "Select your state.";
  if (!/^[1-9]\d{5}$/.test(f.pincode)) errors.pincode = "Enter a valid 6-digit PIN code.";
  return { value: { ...f, phone: phone ?? f.phone }, errors };
}
