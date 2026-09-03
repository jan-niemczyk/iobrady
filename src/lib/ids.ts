import { customAlphabet } from "nanoid";

// Bezpieczny alfabet URL: małe/wielkie litery i cyfry bez znaków problematycznych w adresach.
// 16 znaków = bardzo niskie prawdopodobieństwo kolizji, a całość mieści się w limicie 20 znaków.
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const nano = customAlphabet(ALPHABET, 16);

// Krótki identyfikator posiedzenia (max 16 znaków), używany m.in. w adresach URL.
export function newMeetingId(): string {
  return nano();
}
