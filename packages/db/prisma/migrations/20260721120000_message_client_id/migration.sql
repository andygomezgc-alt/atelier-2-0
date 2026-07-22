-- Idempotencia de mensajes del chef: el mismo envío lógico puede reintentar el
-- stream sin insertar dos veces el turno user. La columna es nullable para que
-- clientes anteriores y mensajes assistant sigan coexistiendo sin conflicto.

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "clientMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_clientMessageId_key" ON "Message"("conversationId", "clientMessageId");
