import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { imageUrl } from "../storage";
export function Portrait({
  image,
  className = "",
  onClick,
  label,
}: {
  image: string;
  className?: string;
  onClick?: () => void;
  label?: string;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl("");
    setFailed(false);
    if (image && !image.startsWith("builtin:"))
      imageUrl(image)
        .then((url) => {
          if (alive) setUrl(url);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    return () => {
      alive = false;
    };
  }, [image]);
  const builtin = image.startsWith("builtin:");
  const index = builtin ? Number(image.split(":")[1]) : 0;
  const content = (
    <>
      {builtin ? (
        <div
          className="builtin-art"
          style={{
            backgroundImage: "url(/art/characters.png)",
            backgroundPosition: `${index * 50}% 28%`,
          }}
        />
      ) : url && !failed ? (
        <img
          src={url}
          alt={label ?? "角色图片"}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="portrait-placeholder">
          <UserRound size={40} strokeWidth={1} />
          <span>
            {failed ? "图片暂不可用" : image ? "载入图片…" : "添加角色照片"}
          </span>
        </div>
      )}
    </>
  );
  return onClick ? (
    <button
      className={"portrait " + className}
      onClick={onClick}
      aria-label={label ?? "查看角色照片"}
    >
      {content}
    </button>
  ) : (
    <div className={"portrait " + className}>{content}</div>
  );
}
