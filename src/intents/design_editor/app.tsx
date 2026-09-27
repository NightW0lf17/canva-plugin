import { Button, Rows, Text, Title } from "@canva/app-ui-kit";
import { addPage } from "@canva/design";
import { useEffect, useState } from "react";

import { supabase } from "../../supabase";

const SESSION_ID = "desktop-lucas";

export function App() {
  const [supabaseOnline, setSupabaseOnline] = useState(false);
  const [realtimeOnline, setRealtimeOnline] = useState(false);
  const [status, setStatus] = useState("");

  const [json, setJson] = useState(`{
  "action": "create_page_from_json",
  "payload": {
    "width": 1920,
    "height": 1080,
    "background": "#071014",
    "elements": [
      {
        "type": "text",
        "text": "AI Designer Bridge",
        "x": 120,
        "y": 120,
        "width": 900,
        "fontSize": 72,
        "color": "#FFFFFF"
      }
    ]
  }
}`);

  // ==========================================
  // RETÂNGULO
  // ==========================================

  function criarRetangulo(el: any) {
  const width = el.width || 400;
  const height = el.height || 200;

  return {
    type: "shape",

    top: el.y || 0,
    left: el.x || 0,

    width,
    height,

    viewBox: {
      top: 0,
      left: 0,
      width,
      height,
    },

    paths: [
      {
        d: `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,

        fill: {
          color: el.background || "#10191C",
          dropTarget: false,
        },
      },
    ],
  };

    return {
      type: "shape",

      top: el.y || 0,
      left: el.x || 0,

      width,
      height,

      viewBox: {
        top: 0,
        left: 0,
        width,
        height,
      },

      paths: [
        {
          d: `
            M 0 0
            L ${width} 0
            L ${width} ${height}
            L 0 ${height}
            Z
          `,

          fill: {
            color: el.background || "#10191C",
          },
        },
      ],
    };
  }

  // ==========================================
  // CRIAR PÁGINA
  // ==========================================

  async function criarPaginaPeloJson(payload: any) {
    const elementos: any[] = [];

    for (const el of payload.elements || []) {
      // TEXTO
      if (el.type === "text") {
        elementos.push({
          type: "text",

          children: [el.text || ""],

          top: el.y || 0,
          left: el.x || 0,

          width: el.width || 500,

          fontSize: el.fontSize || 24,

          color: el.color || "#FFFFFF",

          fontWeight:
            el.fontWeight === "bold"
              ? "bold"
              : "normal",

          textAlign:
            el.textAlign || "start",
        });
      }

      // RETÂNGULO
      if (el.type === "rectangle") {
        elementos.push(
          criarRetangulo(el)
        );
      }
    }

    const pagina = await addPage({
      dimensions: {
        width:
          payload.width || 1920,

        height:
          payload.height || 1080,
      },

      background: {
        color:
          payload.background ||
          "#071014",
      },

      elements: elementos,
    });

    return pagina;
  }

  // ==========================================
  // EXECUTAR COMANDO
  // ==========================================

  async function executarComando(command: any) {
    if (
      command.action ===
      "create_page_from_json"
    ) {
      const pagina =
        await criarPaginaPeloJson(
          command.payload
        );

      return {
        pageId: pagina.id,
      };
    }

    throw new Error(
      `Comando não suportado: ${command.action}`
    );
  }

  // ==========================================
  // PROCESSAR COMANDO DO SUPABASE
  // ==========================================

  async function processarComando(command: any) {
    if (
      !command ||
      command.status !== "pending"
    ) {
      return;
    }

    try {
      setStatus(
        `Pegando comando: ${command.action}`
      );

      // Tenta reservar o comando.
      // Evita 2 PCs executarem a mesma coisa.
      const {
        data: claimed,
        error: claimError,
      } = await supabase
        .from("canva_commands")
        .update({
          status: "processing",
        })
        .eq("id", command.id)
        .eq("status", "pending")
        .select("id");

      if (claimError) {
        throw claimError;
      }

      if (
        !claimed ||
        claimed.length === 0
      ) {
        console.log(
          "Outro cliente já pegou este comando."
        );

        return;
      }

      setStatus(
        `Executando: ${command.action}`
      );

      const result =
        await executarComando({
          action: command.action,
          payload: command.payload,
        });

      const { error } = await supabase
        .from("canva_commands")
        .update({
          status: "completed",

          result,

          error: null,

          completed_at:
            new Date().toISOString(),
        })
        .eq("id", command.id);

      if (error) {
        throw error;
      }

      setStatus(
        "Comando concluído ✅"
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        "Erro executando comando:",
        error
      );

      await supabase
        .from("canva_commands")
        .update({
          status: "error",

          error: message,

          completed_at:
            new Date().toISOString(),
        })
        .eq("id", command.id);

      setStatus(
        `Erro: ${message}`
      );
    }
  }

  // ==========================================
  // BUSCAR PENDENTES
  // ==========================================

  async function buscarPendentes() {
    try {
      setStatus(
        "Buscando comandos pendentes..."
      );

      const { data, error } =
        await supabase
          .from("canva_commands")
          .select("*")
          .eq(
            "session_id",
            SESSION_ID
          )
          .eq(
            "status",
            "pending"
          )
          .order(
            "created_at",
            {
              ascending: true,
            }
          );

      if (error) {
        throw error;
      }

      if (
        !data ||
        data.length === 0
      ) {
        setStatus(
          "Nenhum comando pendente."
        );

        return;
      }

      setStatus(
        `${data.length} comando(s) encontrado(s)`
      );

      for (const command of data) {
        await processarComando(
          command
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(error);

      setStatus(
        `Erro: ${message}`
      );
    }
  }

  // ==========================================
  // TESTAR SUPABASE
  // ==========================================

  async function testarSupabase() {
    try {
      setStatus(
        "Testando Supabase..."
      );

      const { data, error } =
        await supabase
          .from("canva_commands")
          .select("id, status")
          .limit(1);

      if (error) {
        throw error;
      }

      console.log(
        "Supabase respondeu:",
        data
      );

      setSupabaseOnline(true);

      setStatus(
        "Teste do Supabase concluído ✅"
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(error);

      setSupabaseOnline(false);

      setStatus(
        `Erro Supabase: ${message}`
      );
    }
  }

  // ==========================================
  // REALTIME
  // ==========================================

  useEffect(() => {
    async function iniciar() {
      await testarSupabase();

      await buscarPendentes();
    }

    iniciar();

    const channel = supabase
      .channel(
        "ai-designer-bridge"
      )

      .on(
        "postgres_changes",

        {
          event: "INSERT",

          schema: "public",

          table:
            "canva_commands",

          filter:
            `session_id=eq.${SESSION_ID}`,
        },

        async (payload) => {
          console.log(
            "Novo comando recebido:",
            payload.new
          );

          await processarComando(
            payload.new
          );
        }
      )

      .subscribe(
        (realtimeStatus) => {
          console.log(
            "Realtime:",
            realtimeStatus
          );

          if (
            realtimeStatus ===
            "SUBSCRIBED"
          ) {
            setRealtimeOnline(
              true
            );
          } else if (
            realtimeStatus ===
              "CHANNEL_ERROR" ||
            realtimeStatus ===
              "TIMED_OUT" ||
            realtimeStatus ===
              "CLOSED"
          ) {
            setRealtimeOnline(
              false
            );
          }
        }
      );

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, []);

  // ==========================================
  // EXECUTAR JSON MANUAL
  // ==========================================

  async function executarJsonManual() {
    try {
      setStatus(
        "Executando JSON manual..."
      );

      const command =
        JSON.parse(json);

      await executarComando(
        command
      );

      setStatus(
        "Página criada manualmente ✅"
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(error);

      setStatus(
        `Erro JSON: ${message}`
      );
    }
  }

  // ==========================================
  // INTERFACE
  // ==========================================

  return (
    <Rows spacing="2u">

      <Rows spacing="1u">

        <Title>
          AI Designer Bridge
        </Title>

        <Text>
          Canva conectado ✅
        </Text>

        <Text>
          Supabase{" "}
          {supabaseOnline
            ? "conectado ✅"
            : "desconectado ❌"}
        </Text>

        <Text>
          Realtime{" "}
          {realtimeOnline
            ? "conectado ✅"
            : "conectando..."}
        </Text>

        {status && (
          <Text>
            {status}
          </Text>
        )}

      </Rows>

      <Button
        variant="secondary"
        onClick={
          testarSupabase
        }
      >
        Testar Supabase
      </Button>

      <Button
        variant="secondary"
        onClick={
          buscarPendentes
        }
      >
        Buscar pendentes
      </Button>

      <div>

        <Text>
          COMANDO JSON
        </Text>

        <textarea
          value={json}

          onChange={(
            event
          ) =>
            setJson(
              event.target.value
            )
          }

          style={{
            width: "100%",

            height: "260px",

            marginTop:
              "8px",

            padding:
              "10px",

            background:
              "#101217",

            color:
              "#FFFFFF",

            border:
              "1px solid #30343b",

            borderRadius:
              "8px",

            fontFamily:
              "monospace",

            fontSize:
              "11px",

            boxSizing:
              "border-box",
          }}
        />

      </div>

      <Button
        variant="primary"
        onClick={
          executarJsonManual
        }
      >
        Executar JSON manual
      </Button>

    </Rows>
  );
}