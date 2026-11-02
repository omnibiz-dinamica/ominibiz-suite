import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { messagesAccess } from "@/lib/messages/permissions";
import { AutomationsTab } from "./AutomationsTab";
import { ContactsTab } from "./ContactsTab";
import { TagsFieldsTab } from "./TagsFieldsTab";
import { ChannelsTab } from "./ChannelsTab";

type TabKey = "automacoes" | "contatos" | "tags" | "canais";

/**
 * Módulo "Mensagens" (catálogo: "WhatsApp com IA", chave whatsapp_ai) — Etapa 1.
 * A rota já está protegida por ModuleGuard (adicional ativo) e RoleGuard (papéis).
 */
export function MessagesPage() {
  const { currentCompanyId, effectiveRole } = useAuth();
  const access = messagesAccess(effectiveRole);
  const tabs: { key: TabKey; label: string }[] = access.canManage
    ? [
        { key: "automacoes", label: "Automações" },
        { key: "contatos", label: "Contatos" },
        { key: "tags", label: "Tags e Campos" },
        { key: "canais", label: "Canais" },
      ]
    : [{ key: "contatos", label: "Contatos" }];
  const [tab, setTab] = useState<TabKey>(tabs[0].key);

  if (!currentCompanyId) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Mensagens</h1>
          <p className="text-sm text-muted-foreground">
            {access.canManage
              ? "Automações, contatos e canais de Instagram e WhatsApp."
              : "Consulta dos contatos da empresa."}
          </p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="flex h-auto flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {access.canManage ? (
          <TabsContent value="automacoes" className="mt-4">
            <AutomationsTab companyId={currentCompanyId} />
          </TabsContent>
        ) : null}
        <TabsContent value="contatos" className="mt-4">
          <ContactsTab companyId={currentCompanyId} canManage={access.canManage} />
        </TabsContent>
        {access.canManage ? (
          <>
            <TabsContent value="tags" className="mt-4">
              <TagsFieldsTab companyId={currentCompanyId} />
            </TabsContent>
            <TabsContent value="canais" className="mt-4">
              <ChannelsTab />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}
