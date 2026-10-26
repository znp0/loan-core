import { randomUUID } from "node:crypto";

// Repository double for HTTP behavior. It serializes transactions but does not establish PostgreSQL's locking/index guarantees; use TEST_DATABASE_URL for that.
export function memoryPrisma() {
  let applications = [];
  let documents = [];
  let contacts = [];
  let queue = Promise.resolve();
  const included = (row) =>
    row && {
      ...row,
      contacts: contacts
        .filter((contact) => contact.applicationId === row.id)
        .sort((a, b) => a.position - b.position),
      documents: documents.filter(
        (document) => document.applicationId === row.id && document.isCurrent,
      ),
    };
  const prisma = {
    $queryRaw: async () => [],
    async $transaction(work) {
      const previous = queue;
      let release;

      queue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      const snapshot = structuredClone({ applications, documents, contacts });

      try {
        return await work(prisma);
      } catch (error) {
        ({ applications, documents, contacts } = snapshot);
        throw error;
      } finally {
        release();
      }
    },
    loanApplication: {
      async findUnique({ where, include }) {
        const row = applications.find((value) => value.id === where.id) ?? null;

        return include ? included(row) : row && { ...row };
      },
      async findFirst({ where }) {
        return (
          applications.find(
            (row) => row.customerId === where.customerId && where.status.in.includes(row.status),
          ) ?? null
        );
      },
      async create({ data, include }) {
        const nullable = [
          "fullName",
          "dateOfBirth",
          "identityNumber",
          "identityIssuedDate",
          "email",
          "phone",
          "addressLine",
          "ward",
          "district",
          "province",
          "employmentType",
          "employerName",
          "jobTitle",
          "employmentStartDate",
          "monthlyIncome",
          "otherMonthlyIncome",
          "accountNumber",
          "accountHolderName",
        ];
        const row = {
          ...Object.fromEntries(nullable.map((key) => [key, null])),
          id: randomUUID(),
          status: "DRAFT",
          accountVerificationStatus: "UNVERIFIED",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };

        applications.push(row);

        return include ? included(row) : { ...row };
      },
      async update({ where, data, include }) {
        const row = applications.find((value) => value.id === where.id);

        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined && key !== "contacts") {
            row[key] = value;
          }
        }
        row.updatedAt = new Date();

        if (data.contacts) {
          contacts.push(
            ...data.contacts.create.map((contact) => ({
              ...contact,
              id: randomUUID(),
              applicationId: row.id,
            })),
          );
        }

        return include ? included(row) : { ...row };
      },
    },
    applicationContact: {
      async deleteMany({ where }) {
        contacts = contacts.filter((row) => row.applicationId !== where.applicationId);
      },
    },
    applicationDocument: {
      async findUnique({ where }) {
        return documents.find((row) => row.id === where.id) ?? null;
      },
      async findMany({ where }) {
        return documents.filter((row) => row.applicationId === where.applicationId);
      },
      async updateMany({ where, data }) {
        for (const row of documents) {
          if (
            row.applicationId === where.applicationId &&
            row.type === where.type &&
            row.isCurrent === where.isCurrent
          ) {
            Object.assign(row, data);
          }
        }
      },
      async create({ data }) {
        const row = { id: randomUUID(), uploadedAt: new Date(), isCurrent: true, ...data };

        documents.push(row);

        return { ...row };
      },
    },
  };

  return prisma;
}
