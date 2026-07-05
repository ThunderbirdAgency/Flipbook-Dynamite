import { promises as fs } from "fs";
import path from "path";
import { Book } from "./types";

const DATA_DIR = process.env.FLIPBOOK_DATA_DIR || path.join(process.cwd(), "data");
const PDF_DIR = path.join(DATA_DIR, "pdfs");
const INDEX_FILE = path.join(DATA_DIR, "books.json");

async function ensureDirs() {
  await fs.mkdir(PDF_DIR, { recursive: true });
}

async function readIndex(): Promise<Book[]> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf-8");
    return JSON.parse(raw) as Book[];
  } catch {
    return [];
  }
}

async function writeIndex(books: Book[]) {
  await ensureDirs();
  const tmp = INDEX_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(books, null, 2));
  await fs.rename(tmp, INDEX_FILE);
}

export async function listBooks(): Promise<Book[]> {
  const books = await readIndex();
  return books.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBook(id: string): Promise<Book | null> {
  const books = await readIndex();
  return books.find((b) => b.id === id) ?? null;
}

export async function createBook(book: Book, pdf: Buffer): Promise<Book> {
  await ensureDirs();
  await fs.writeFile(pdfPath(book.id), pdf);
  const books = await readIndex();
  books.push(book);
  await writeIndex(books);
  return book;
}

export async function updateBook(
  id: string,
  patch: Partial<Pick<Book, "title">>
): Promise<Book | null> {
  const books = await readIndex();
  const book = books.find((b) => b.id === id);
  if (!book) return null;
  if (typeof patch.title === "string" && patch.title.trim()) {
    book.title = patch.title.trim().slice(0, 200);
  }
  await writeIndex(books);
  return book;
}

export async function deleteBook(id: string): Promise<boolean> {
  const books = await readIndex();
  const idx = books.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  books.splice(idx, 1);
  await writeIndex(books);
  await fs.unlink(pdfPath(id)).catch(() => {});
  return true;
}

export function pdfPath(id: string): string {
  // ids come from nanoid's URL-safe alphabet; reject anything else so a
  // crafted id can never traverse outside PDF_DIR
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("invalid book id");
  return path.join(PDF_DIR, `${id}.pdf`);
}
