export interface Book {
  id: string;
  title: string;
  fileName: string;
  size: number;
  createdAt: string;
  /** Clerk user id of the creator; absent for books made in open mode. */
  ownerId?: string;
}
