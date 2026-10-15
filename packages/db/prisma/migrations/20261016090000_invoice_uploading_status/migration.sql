-- Invoices are created while their pages upload (one request per page) and start reading afterwards.
ALTER TYPE "InvoiceStatus" ADD VALUE 'uploading' BEFORE 'reading';
