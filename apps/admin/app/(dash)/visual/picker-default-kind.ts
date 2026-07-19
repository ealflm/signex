// Which side an Ảnh/Video toggle opens on: the kind the slot currently holds, else the caps default.
export function pickerDefaultKind(
  storedKind: "image" | "video" | null,
  postedMediaKind: "image" | "video",
): "image" | "video" {
  return storedKind ?? postedMediaKind;
}
