import { Code2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loaderSnippet } from "@/lib/loader-snippet";
export function ThreeJsSnippet({ filename }: { filename: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(loaderSnippet(filename));
      toast.success("Three.js loader snippet copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  }
  return (
    <section>
      <Button
        id="copy-code"
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 text-xs"
        onClick={copy}
      >
        <Code2 />
        Copy loader snippet
        <Copy className="ml-auto" />
      </Button>
    </section>
  );
}
