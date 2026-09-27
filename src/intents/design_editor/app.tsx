import { addPage } from "@canva/design";
import { useEffect, useState } from "react";
import { supabase } from "../../supabase";

const SESSION_ID = "desktop-lucas";

const JSON_PADRAO = `{
  "action": "create_page_from_json",
  "payload": {
    "width": 1920,
    "height": 1080,
    "background": "#070A12",
    "elements": [
      {
        "type": "text",
        "text": "AI Designer Bridge",
        "x": 120,
        "y": 120,
        "width": 1000,
        "fontSize": 72,
        "color": "#FFFFFF",
        "fontWeight": "bold"
      },
      {
        "type": "rectangle",
        "x": 120,
        "y": 300,
        "width": 650,
        "height": 220,
        "background": "#7C5CFF"
      }
    ]
  }
}`;

export const App = () => {
  const [supabaseOnline, setSupabaseOnline] = useState(false);
  const [realtimeOnline, setRealtimeOnline] = useState(false);

  const [status, setStatus] = useState("Aguardando comandos");
  const [ultimaAcao, setUltimaAcao] = useState("Nenhuma execução");

  const [processando, setProcessando] = useState(false);
  const [pendentes, setPendentes] = useState(0);

  const [modo, setModo] = useState<"auto" | "manual">("auto");

  const [json, setJson] = useState(JSON_PADRAO);

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
            color: el.background || "#7C5CFF",
            dropTarget: false,
          },
        },
      ],
    };
  }

  async function criarPaginaPeloJson(payload: any) {
    if (!payload) {
      throw new Error("Payload não informado.");
    }

    const elementos: any[] = [];

    for (const el of payload.elements || []) {
      if (el.type === "text") {
        elementos.push({
          type: "text",

          children: [el.text || ""],

          top: el.y ?? 0,
          left: el.x ?? 0,

          width: el.width ?? 800,

          fontSize: el.fontSize ?? 40,

          color: el.color || "#FFFFFF",

          fontWeight: el.fontWeight || "normal",

          textAlign: el.textAlign || "start",
        });
      }

      if (el.type === "rectangle") {
        elementos.push(criarRetangulo(el));
      }
    }

    const pagina = await addPage({
      dimensions: {
        width: payload.width || 1920,
        height: payload.height || 1080,
      },

      background: {
        color: payload.background || "#FFFFFF",
      },

      elements: elementos,
    });

    return pagina;
  }

  async function executarComando(command: any) {
    if (!command) {
      throw new Error("Comando vazio.");
    }

    if (command.action === "create_page_from_json") {
      const pagina = await criarPaginaPeloJson(command.payload);

      return {
        success: true,
        pageId: pagina.id,
      };
    }

    throw new Error(`Ação não suportada: ${command.action}`);
  }

  async function processarComando(command: any) {
    if (!command) return;

    if (command.status !== "pending") return;

    try {
      setProcessando(true);
      setStatus("Enviando comando para o Canva...");

      const { data: claimed, error: claimError } = await supabase
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

      if (!claimed || claimed.length === 0) {
        return;
      }

      setPendentes((valor) => Math.max(0, valor - 1));

      const resultado = await executarComando(command);

      const { error: updateError } = await supabase
        .from("canva_commands")
        .update({
          status: "completed",
          result: resultado,
          error: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", command.id);

      if (updateError) {
        throw updateError;
      }

      setUltimaAcao(command.action);
      setStatus("Execução concluída");
    } catch (erro: any) {
      console.error(erro);

      const mensagem =
        erro?.message || "Erro desconhecido durante a execução.";

      setUltimaAcao("Falha na execução");
      setStatus(`Erro: ${mensagem}`);

      if (command?.id) {
        await supabase
          .from("canva_commands")
          .update({
            status: "error",
            error: mensagem,
            completed_at: new Date().toISOString(),
          })
          .eq("id", command.id);
      }
    } finally {
      setProcessando(false);
    }
  }

  async function buscarPendentes() {
    try {
      setProcessando(true);
      setStatus("Verificando fila...");

      const { data, error } = await supabase
        .from("canva_commands")
        .select("*")
        .eq("session_id", SESSION_ID)
        .eq("status", "pending")
        .order("created_at", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      const comandos = data || [];

      setPendentes(comandos.length);

      if (comandos.length === 0) {
        setStatus("Fila vazia");
        return;
      }

      setStatus(
        `${comandos.length} comando${
          comandos.length === 1 ? "" : "s"
        } encontrado${comandos.length === 1 ? "" : "s"}`,
      );

      for (const comando of comandos) {
        await processarComando(comando);
      }

      setStatus("Fila processada");
    } catch (erro: any) {
      console.error(erro);

      setStatus(
        `Erro ao verificar fila: ${
          erro?.message || "Erro desconhecido"
        }`,
      );
    } finally {
      setProcessando(false);
    }
  }

  async function testarSupabase() {
    try {
      const { error } = await supabase
        .from("canva_commands")
        .select("id,status")
        .limit(1);

      if (error) {
        throw error;
      }

      setSupabaseOnline(true);

      return true;
    } catch (erro) {
      console.error(erro);

      setSupabaseOnline(false);

      return false;
    }
  }

  async function contarPendentes() {
    try {
      const { count, error } = await supabase
        .from("canva_commands")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("session_id", SESSION_ID)
        .eq("status", "pending");

      if (error) return;

      setPendentes(count || 0);
    } catch (erro) {
      console.error(erro);
    }
  }

  useEffect(() => {
    testarSupabase();
    contarPendentes();
    buscarPendentes();

    const channel = supabase
      .channel("ai-designer-bridge")

      .on(
        "postgres_changes",

        {
          event: "INSERT",

          schema: "public",

          table: "canva_commands",

          filter: `session_id=eq.${SESSION_ID}`,
        },

        async (payload) => {
          console.log("Novo comando recebido:", payload.new);

          setPendentes((valor) => valor + 1);

          await processarComando(payload.new);
        },
      )

      .subscribe((realtimeStatus) => {
        console.log("Realtime:", realtimeStatus);

        if (realtimeStatus === "SUBSCRIBED") {
          setRealtimeOnline(true);
        }

        if (
          realtimeStatus === "CHANNEL_ERROR" ||
          realtimeStatus === "TIMED_OUT" ||
          realtimeStatus === "CLOSED"
        ) {
          setRealtimeOnline(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function executarJsonManual() {
    try {
      setProcessando(true);

      setStatus("Executando comando manual...");

      const command = JSON.parse(json);

      const resultado = await executarComando(command);

      console.log("Resultado manual:", resultado);

      setUltimaAcao(command.action);

      setStatus("Comando manual concluído");
    } catch (erro: any) {
      console.error(erro);

      setUltimaAcao("Falha no JSON");

      setStatus(
        `Erro no JSON: ${
          erro?.message || "Erro desconhecido"
        }`,
      );
    } finally {
      setProcessando(false);
    }
  }

  const sistemaOnline =
    supabaseOnline && realtimeOnline;

  const filaFormatada =
    pendentes < 10 ? `0${pendentes}` : `${pendentes}`;

  return (
    <div style={styles.app}>
      {/* TOPO */}

      <div style={styles.topLine}>
        <span style={styles.systemId}>
          PONTE / 01
        </span>

        <div
          style={{
            ...styles.liveIndicator,

            ...(sistemaOnline
              ? styles.liveOnline
              : styles.liveOffline),
          }}
        >
          <span
            style={{
              ...styles.liveDot,

              background: sistemaOnline
                ? "#4ADEA2"
                : "#FFB454",
            }}
          />

          {sistemaOnline
            ? "ONLINE"
            : "CONECTANDO"}
        </div>
      </div>

      {/* IDENTIDADE */}

      <div style={styles.hero}>
        <div style={styles.brandMark}>
          <div style={styles.brandInner} />
        </div>

        <div>
          <div style={styles.heroTitle}>
            AI DESIGNER
          </div>

          <div style={styles.heroTitleAccent}>
            BRIDGE
          </div>

          <div style={styles.heroSubtitle}>
            Interface de automação do Canva
          </div>
        </div>
      </div>

      {/* MAPA DA PONTE */}

      <div style={styles.bridgeArea}>
        <div style={styles.bridgeNode}>
          <div style={styles.nodeCircle}>
            C
          </div>

          <div style={styles.nodeText}>
            CANVA
          </div>

          <div style={styles.nodeStatus}>
            CONECTADO
          </div>
        </div>

        <div style={styles.bridgeConnector}>
          <div style={styles.bridgeLine} />

          <div style={styles.bridgeCenter}>
            <div style={styles.bridgeCenterDot} />

            <span>PONTE</span>
          </div>

          <div style={styles.bridgeLine} />
        </div>

        <div style={styles.bridgeNode}>
          <div
            style={{
              ...styles.nodeCircle,

              opacity: supabaseOnline
                ? 1
                : 0.35,
            }}
          >
            S
          </div>

          <div style={styles.nodeText}>
            SUPABASE
          </div>

          <div style={styles.nodeStatus}>
            {supabaseOnline
              ? "CONECTADO"
              : "DESCONECTADO"}
          </div>
        </div>
      </div>

      {/* TEMPO REAL */}

      <div style={styles.realtimeStrip}>
        <div style={styles.realtimePulse}>
          <span
            style={{
              ...styles.smallDot,

              background: realtimeOnline
                ? "#4ADEA2"
                : "#FFB454",
            }}
          />

          TEMPO REAL
        </div>

        <span style={styles.realtimeState}>
          {realtimeOnline
            ? "SINCRONIZAÇÃO ATIVA"
            : "AGUARDANDO SINCRONIZAÇÃO"}
        </span>
      </div>

      {/* MODOS */}

      <div style={styles.modeSelector}>
        <button
          onClick={() => setModo("auto")}
          style={{
            ...styles.modeButton,

            ...(modo === "auto"
              ? styles.modeActive
              : {}),
          }}
        >
          AUTOMÁTICO
        </button>

        <button
          onClick={() => setModo("manual")}
          style={{
            ...styles.modeButton,

            ...(modo === "manual"
              ? styles.modeActive
              : {}),
          }}
        >
          {"{ JSON }"}
        </button>
      </div>

      {/* AUTOMÁTICO */}

      {modo === "auto" && (
        <>
          <div style={styles.queuePanel}>
            <div style={styles.panelCode}>
              FILA / ENTRADA
            </div>

            <div style={styles.queueMain}>
              <div>
                <div style={styles.queueNumber}>
                  {filaFormatada}
                </div>

                <div style={styles.queueLabel}>
                  COMANDOS PENDENTES
                </div>
              </div>
            </div>

            <div style={styles.queueStatus}>
              {pendentes === 0
                ? "Nenhum comando pendente"
                : `${pendentes} comando${
                    pendentes === 1
                      ? ""
                      : "s"
                  } aguardando`}
            </div>

            <button
              onClick={buscarPendentes}
              disabled={processando}
              style={{
                ...styles.scanButton,

                opacity: processando
                  ? 0.55
                  : 1,
              }}
            >
              <span>
                {processando
                  ? "PROCESSANDO"
                  : "VERIFICAR FILA"}
              </span>

              <span style={styles.arrow}>
                →
              </span>
            </button>
          </div>

          {/* ÚLTIMA EXECUÇÃO */}

          <div style={styles.transmissionPanel}>
            <div style={styles.transmissionHeader}>
              <span>
                ÚLTIMA EXECUÇÃO
              </span>

              <span style={styles.transmissionId}>
                EXEC / 01
              </span>
            </div>

            <div style={styles.transmissionBody}>
              <div style={styles.transmissionRail}>
                <div
                  style={{
                    ...styles.transmissionPoint,

                    background: status
                      .toLowerCase()
                      .includes("erro")
                      ? "#FF6577"
                      : "#7C5CFF",
                  }}
                />

                <div
                  style={
                    styles.transmissionLine
                  }
                />
              </div>

              <div style={styles.transmissionContent}>
                <div style={styles.lastAction}>
                  {ultimaAcao}
                </div>

                <div style={styles.lastStatus}>
                  {status}
                </div>
              </div>
            </div>
          </div>

          {/* FLUXO */}

          <div style={styles.systemFooterLine}>
            <span>
              CANVA
            </span>

            <span style={styles.footerConnector}>
              ─────
            </span>

            <span style={styles.footerBridge}>
              PONTE
            </span>

            <span style={styles.footerConnector}>
              ─────
            </span>

            <span>
              SUPABASE
            </span>
          </div>

          <button
            style={styles.testButton}
            onClick={async () => {
              setStatus(
                "Testando conexão...",
              );

              const conectado =
                await testarSupabase();

              if (conectado) {
                setStatus(
                  "Supabase conectado",
                );
              } else {
                setStatus(
                  "Falha na conexão",
                );
              }
            }}
          >
            TESTAR CONEXÃO
          </button>
        </>
      )}

      {/* JSON MANUAL */}

      {modo === "manual" && (
        <div style={styles.manualPanel}>
          <div style={styles.manualHeader}>
            <div>
              <div style={styles.panelCode}>
                MANUAL / ENTRADA
              </div>

              <div style={styles.manualTitle}>
                COMANDO JSON
              </div>
            </div>

            <div style={styles.codeBadge}>
              {"{ }"}
            </div>
          </div>

          <div style={styles.editorShell}>
            <div style={styles.editorTop}>
              <span>
                comando.json
              </span>

              <span>
                UTF-8
              </span>
            </div>

            <textarea
              value={json}
              onChange={(event) =>
                setJson(event.target.value)
              }
              spellCheck={false}
              style={styles.textarea}
            />
          </div>

          <button
            onClick={executarJsonManual}
            disabled={processando}
            style={{
              ...styles.executeButton,

              opacity: processando
                ? 0.55
                : 1,
            }}
          >
            <span>
              {processando
                ? "EXECUTANDO"
                : "EXECUTAR COMANDO"}
            </span>

            <span>
              →
            </span>
          </button>

          <div style={styles.manualLog}>
            <span
              style={{
                ...styles.smallDot,

                background: status
                  .toLowerCase()
                  .includes("erro")
                  ? "#FF6577"
                  : "#7C5CFF",
              }}
            />

            <span>
              {status}
            </span>
          </div>
        </div>
      )}

      {/* RODAPÉ */}

      <div style={styles.footer}>
        <span>
          AI DESIGNER BRIDGE
        </span>

        <span>
          V0.2
        </span>
      </div>
    </div>
  );
};

const styles: Record<string, any> = {
  app: {
    minHeight: "100vh",

    boxSizing: "border-box",

    padding: "20px",

    background: `
      radial-gradient(
        circle at 100% 0%,
        rgba(124, 92, 255, 0.12),
        transparent 35%
      ),
      linear-gradient(
        180deg,
        #070A12 0%,
        #090D17 100%
      )
    `,

    color: "#F4F6FF",

    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  topLine: {
    display: "flex",

    alignItems: "center",

    justifyContent: "space-between",

    marginBottom: "22px",
  },

  systemId: {
    color: "#626D8C",

    fontFamily:
      "Consolas, monospace",

    fontSize: "9px",

    fontWeight: 700,

    letterSpacing: "1.6px",
  },

  liveIndicator: {
    display: "flex",

    alignItems: "center",

    gap: "7px",

    padding: "5px 8px",

    fontSize: "8px",

    fontFamily:
      "Consolas, monospace",

    fontWeight: 800,

    letterSpacing: "1px",

    borderRadius: "4px",
  },

  liveOnline: {
    color: "#4ADEA2",

    background:
      "rgba(74, 222, 162, 0.06)",

    border:
      "1px solid rgba(74, 222, 162, 0.18)",
  },

  liveOffline: {
    color: "#FFB454",

    background:
      "rgba(255, 180, 84, 0.06)",

    border:
      "1px solid rgba(255, 180, 84, 0.18)",
  },

  liveDot: {
    width: "5px",

    height: "5px",

    borderRadius: "100%",
  },

  hero: {
    display: "flex",

    alignItems: "flex-start",

    gap: "14px",

    marginBottom: "27px",
  },

  brandMark: {
    width: "43px",

    height: "43px",

    flexShrink: 0,

    display: "flex",

    alignItems: "center",

    justifyContent: "center",

    border:
      "1px solid rgba(124, 92, 255, 0.55)",

    transform: "rotate(45deg)",
  },

  brandInner: {
    width: "13px",

    height: "13px",

    background: "#7C5CFF",

    boxShadow:
      "0 0 24px rgba(124, 92, 255, 0.65)",
  },

  heroTitle: {
    lineHeight: "1",

    fontSize: "20px",

    fontWeight: 800,

    letterSpacing: "-0.6px",
  },

  heroTitleAccent: {
    marginTop: "2px",

    lineHeight: "1",

    color: "#9277FF",

    fontSize: "20px",

    fontWeight: 800,

    letterSpacing: "1.4px",
  },

  heroSubtitle: {
    marginTop: "7px",

    color: "#6F7997",

    fontFamily:
      "Consolas, monospace",

    fontSize: "8px",

    letterSpacing: "0.5px",
  },

  bridgeArea: {
    display: "grid",

    gridTemplateColumns:
      "60px 1fr 70px",

    alignItems: "center",

    marginBottom: "12px",

    padding: "15px 5px",
  },

  bridgeNode: {
    textAlign: "center",
  },

  nodeCircle: {
    width: "29px",

    height: "29px",

    margin: "0 auto 8px",

    display: "flex",

    alignItems: "center",

    justifyContent: "center",

    background:
      "rgba(124, 92, 255, 0.10)",

    border:
      "1px solid rgba(124, 92, 255, 0.32)",

    color: "#B7A6FF",

    fontFamily:
      "Consolas, monospace",

    fontSize: "10px",

    fontWeight: 800,

    borderRadius: "50%",
  },

  nodeText: {
    fontFamily:
      "Consolas, monospace",

    fontSize: "8px",

    fontWeight: 800,

    letterSpacing: "0.8px",
  },

  nodeStatus: {
    marginTop: "4px",

    color: "#59627E",

    fontFamily:
      "Consolas, monospace",

    fontSize: "6px",

    letterSpacing: "0.7px",
  },

  bridgeConnector: {
    display: "flex",

    alignItems: "center",

    justifyContent: "center",
  },

  bridgeLine: {
    height: "1px",

    flex: 1,

    background:
      "linear-gradient(90deg, transparent, #5543B5, #7C5CFF)",
  },

  bridgeCenter: {
    display: "flex",

    flexDirection: "column",

    alignItems: "center",

    gap: "4px",

    margin: "0 6px",

    color: "#7C5CFF",

    fontFamily:
      "Consolas, monospace",

    fontSize: "6px",

    fontWeight: 800,

    letterSpacing: "0.7px",
  },

  bridgeCenterDot: {
    width: "7px",

    height: "7px",

    background: "#7C5CFF",

    borderRadius: "50%",

    boxShadow:
      "0 0 16px rgba(124, 92, 255, 0.9)",
  },

  realtimeStrip: {
    display: "flex",

    justifyContent: "space-between",

    alignItems: "center",

    marginBottom: "20px",

    padding: "7px 10px",

    background:
      "rgba(124, 92, 255, 0.04)",

    borderLeft:
      "2px solid #7C5CFF",

    color: "#7C86A7",

    fontFamily:
      "Consolas, monospace",

    fontSize: "7px",
  },

  realtimePulse: {
    display: "flex",

    alignItems: "center",

    gap: "6px",

    color: "#AFA5FF",

    fontWeight: 800,

    letterSpacing: "0.8px",
  },

  realtimeState: {
    color: "#59627E",

    letterSpacing: "0.8px",
  },

  smallDot: {
    width: "5px",

    height: "5px",

    display: "inline-block",

    borderRadius: "50%",
  },

  modeSelector: {
    display: "grid",

    gridTemplateColumns: "1fr 1fr",

    marginBottom: "18px",

    borderTop:
      "1px solid #202942",

    borderBottom:
      "1px solid #202942",
  },

  modeButton: {
    cursor: "pointer",

    padding: "11px 8px",

    border: "none",

    borderBottom:
      "2px solid transparent",

    background: "transparent",

    color: "#5F6986",

    fontFamily:
      "Consolas, monospace",

    fontSize: "9px",

    fontWeight: 800,

    letterSpacing: "1.2px",
  },

  modeActive: {
    color: "#B7A6FF",

    borderBottom:
      "2px solid #7C5CFF",

    background:
      "linear-gradient(180deg, transparent, rgba(124,92,255,0.06))",
  },

  queuePanel: {
    position: "relative",

    marginBottom: "18px",

    padding: "17px",

    overflow: "hidden",

    background:
      "linear-gradient(145deg, rgba(13,18,32,0.96), rgba(9,13,23,0.96))",

    border:
      "1px solid #202942",

    borderRadius: "5px",
  },

  panelCode: {
    marginBottom: "12px",

    color: "#56617F",

    fontFamily:
      "Consolas, monospace",

    fontSize: "7px",

    fontWeight: 700,

    letterSpacing: "1.4px",
  },

  queueMain: {
    display: "flex",

    justifyContent: "space-between",

    alignItems: "center",
  },

  queueNumber: {
    color: "#F4F6FF",

    fontFamily:
      "Consolas, monospace",

    fontSize: "48px",

    fontWeight: 300,

    lineHeight: "1",
  },

  queueLabel: {
    marginTop: "5px",

    color: "#6C7592",

    fontFamily:
      "Consolas, monospace",

    fontSize: "7px",

    fontWeight: 700,

    letterSpacing: "1px",
  },

  queueStatus: {
    marginTop: "18px",

    paddingTop: "11px",

    borderTop:
      "1px solid rgba(255,255,255,0.05)",

    color: "#747E9B",

    fontSize: "9px",
  },

  scanButton: {
    width: "100%",

    marginTop: "13px",

    padding: "11px 12px",

    display: "flex",

    justifyContent: "space-between",

    alignItems: "center",

    cursor: "pointer",

    background:
      "linear-gradient(90deg, #6D4EFF, #876CFF)",

    border: "none",

    borderRadius: "3px",

    color: "#FFFFFF",

    fontFamily:
      "Consolas, monospace",

    fontSize: "9px",

    fontWeight: 800,

    letterSpacing: "1px",

    boxShadow:
      "0 8px 28px rgba(124, 92, 255, 0.20)",
  },

  arrow: {
    fontSize: "16px",
  },

  transmissionPanel: {
    marginBottom: "17px",

    padding:
      "13px 15px 15px",

    background:
      "rgba(13, 18, 32, 0.55)",

    borderLeft:
      "1px solid #303A5A",

    borderRight:
      "1px solid #151C2C",
  },

  transmissionHeader: {
    display: "flex",

    justifyContent: "space-between",

    marginBottom: "14px",

    color: "#56617F",

    fontFamily:
      "Consolas, monospace",

    fontSize: "7px",

    fontWeight: 800,

    letterSpacing: "1px",
  },

  transmissionId: {
    color: "#7C5CFF",
  },

  transmissionBody: {
    display: "flex",

    gap: "12px",
  },

  transmissionRail: {
    display: "flex",

    flexDirection: "column",

    alignItems: "center",
  },

  transmissionPoint: {
    width: "7px",

    height: "7px",

    borderRadius: "50%",

    boxShadow:
      "0 0 16px rgba(124,92,255,0.7)",
  },

  transmissionLine: {
    width: "1px",

    flex: 1,

    minHeight: "30px",

    marginTop: "5px",

    background:
      "linear-gradient(#49399B, transparent)",
  },

  transmissionContent: {
    minWidth: 0,
  },

  lastAction: {
    overflow: "hidden",

    textOverflow: "ellipsis",

    whiteSpace: "nowrap",

    color: "#D6DAEA",

    fontFamily:
      "Consolas, monospace",

    fontSize: "9px",

    fontWeight: 700,
  },

  lastStatus: {
    marginTop: "5px",

    color: "#68728F",

    fontSize: "8px",
  },

  systemFooterLine: {
    display: "flex",

    justifyContent: "center",

    alignItems: "center",

    gap: "5px",

    marginBottom: "13px",

    color: "#434D69",

    fontFamily:
      "Consolas, monospace",

    fontSize: "6px",

    letterSpacing: "0.7px",
  },

  footerBridge: {
    color: "#7C5CFF",
  },

  footerConnector: {
    color: "#292F45",
  },

  testButton: {
    width: "100%",

    cursor: "pointer",

    padding: "8px",

    background: "transparent",

    border:
      "1px solid #202942",

    borderRadius: "3px",

    color: "#596481",

    fontFamily:
      "Consolas, monospace",

    fontSize: "7px",

    fontWeight: 700,

    letterSpacing: "1px",
  },

  manualPanel: {
    padding: "16px",

    background:
      "rgba(13,18,32,0.75)",

    border:
      "1px solid #202942",

    borderRadius: "5px",
  },

  manualHeader: {
    display: "flex",

    justifyContent: "space-between",

    alignItems: "center",

    marginBottom: "14px",
  },

  manualTitle: {
    color: "#E8EBF7",

    fontFamily:
      "Consolas, monospace",

    fontSize: "13px",

    fontWeight: 800,

    letterSpacing: "1px",
  },

  codeBadge: {
    padding: "5px 7px",

    background:
      "rgba(124,92,255,0.08)",

    border:
      "1px solid rgba(124,92,255,0.26)",

    color: "#A894FF",

    fontFamily:
      "Consolas, monospace",

    fontSize: "9px",
  },

  editorShell: {
    overflow: "hidden",

    marginBottom: "12px",

    background: "#05070D",

    border:
      "1px solid #202942",

    borderRadius: "3px",
  },

  editorTop: {
    display: "flex",

    justifyContent: "space-between",

    padding: "7px 9px",

    background: "#0D1220",

    borderBottom:
      "1px solid #202942",

    color: "#58627E",

    fontFamily:
      "Consolas, monospace",

    fontSize: "7px",
  },

  textarea: {
    width: "100%",

    height: "285px",

    resize: "vertical",

    boxSizing: "border-box",

    padding: "12px",

    outline: "none",

    border: "none",

    background: "#05070D",

    color: "#CAD0E4",

    fontFamily:
      '"Cascadia Code", Consolas, monospace',

    fontSize: "9px",

    lineHeight: "1.6",
  },

  executeButton: {
    width: "100%",

    display: "flex",

    justifyContent: "space-between",

    cursor: "pointer",

    padding: "11px 12px",

    background: "#7C5CFF",

    border: "none",

    borderRadius: "3px",

    color: "#FFFFFF",

    fontFamily:
      "Consolas, monospace",

    fontSize: "9px",

    fontWeight: 800,

    letterSpacing: "0.9px",
  },

  manualLog: {
    display: "flex",

    alignItems: "center",

    gap: "7px",

    marginTop: "12px",

    color: "#636E8B",

    fontFamily:
      "Consolas, monospace",

    fontSize: "7px",
  },

  footer: {
    display: "flex",

    justifyContent: "space-between",

    marginTop: "24px",

    paddingTop: "12px",

    borderTop:
      "1px solid #151C2C",

    color: "#39425C",

    fontFamily:
      "Consolas, monospace",

    fontSize: "6px",

    fontWeight: 700,

    letterSpacing: "1px",
  },
};