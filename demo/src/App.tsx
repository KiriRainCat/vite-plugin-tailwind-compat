import { lazy, Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const LazyPanel = lazy(() => import("./components/LazyPanel"));

export default function App() {
  const [dark, setDark] = useState(false);
  const [showLazy, setShowLazy] = useState(false);

  function toggleTheme() {
    setDark((current) => {
      document.documentElement.classList.toggle("dark", !current);
      return !current;
    });
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-6 sm:p-10">
      <div>
        <p className="text-muted-foreground text-sm">vite-plugin-tailwind-compat</p>
        <h1 className="text-3xl font-semibold tracking-tight">Legacy CSS compatibility demo</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Theme and variable colors</CardTitle>
          <CardDescription>Compare OKLCH tokens, opacity colors, borders and focus rings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-primary/20 bg-primary/50 text-primary-foreground rounded-lg border p-4">
            This surface uses <code>bg-primary/50</code> and <code>border-primary/20</code>.
          </div>
          <Input aria-label="Focus ring test" placeholder="Focus this input to inspect its ring" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={toggleTheme}>{dark ? "Use light theme" : "Use dark theme"}</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portal and transforms</CardTitle>
          <CardDescription>The dialog exercises overlay opacity, translate, zoom and exit animations.</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger render={<Button />}>Open dialog</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Compatibility check</DialogTitle>
                <DialogDescription>
                  The panel should be centered, readable and animated without the modern stylesheet leaking into legacy
                  mode.
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dynamic stylesheet</CardTitle>
          <CardDescription>The lazy component imports its own CSS asset.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={() => setShowLazy(true)} disabled={showLazy}>
            Load lazy panel
          </Button>
          {showLazy && (
            <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
              <LazyPanel />
            </Suspense>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
