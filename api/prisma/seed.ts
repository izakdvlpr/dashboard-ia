import { faker } from "@faker-js/faker";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.ts";
import { OrderChannel, OrderStatus } from "./generated/enums.ts";

const MONTHS_OF_HISTORY = 24;
const PRODUCT_COUNT = 400;
const CUSTOMER_COUNT = 3_000;
const ORDER_COUNT = 25_000;
const CHUNK = 2_000;

faker.seed(20260810);

const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
});

const REGIONS = [
	{ code: "SP", name: "São Paulo" },
	{ code: "RJ", name: "Rio de Janeiro" },
	{ code: "MG", name: "Minas Gerais" },
	{ code: "RS", name: "Rio Grande do Sul" },
	{ code: "PR", name: "Paraná" },
	{ code: "BA", name: "Bahia" },
	{ code: "PE", name: "Pernambuco" },
	{ code: "DF", name: "Distrito Federal" },
];

const CATEGORIES = [
	"Eletrônicos",
	"Informática",
	"Celulares",
	"Casa e Cozinha",
	"Móveis",
	"Moda Masculina",
	"Moda Feminina",
	"Esporte e Lazer",
	"Beleza",
	"Livros",
	"Brinquedos",
	"Automotivo",
];

/** Peso de cada mês (1 = janeiro). Pico em nov/dez, vale em jan/fev. */
const MONTH_WEIGHT = [0.7, 0.72, 0.85, 0.9, 1.05, 0.95, 0.95, 1.0, 1.05, 1.15, 1.6, 1.75];

/** Distribuição de status: a maior parte dos pedidos chega a DELIVERED. */
const STATUS_WEIGHTS: Array<[OrderStatus, number]> = [
	[OrderStatus.DELIVERED, 62],
	[OrderStatus.SHIPPED, 12],
	[OrderStatus.PAID, 9],
	[OrderStatus.PENDING, 6],
	[OrderStatus.CANCELED, 8],
	[OrderStatus.REFUNDED, 3],
];

const CHANNEL_WEIGHTS: Array<[OrderChannel, number]> = [
	[OrderChannel.WEB, 45],
	[OrderChannel.MOBILE, 33],
	[OrderChannel.MARKETPLACE, 15],
	[OrderChannel.IN_STORE, 7],
];

/** Cadeia de eventos que cada status implica, em ordem cronológica. */
const STATUS_CHAIN: Record<OrderStatus, OrderStatus[]> = {
	PENDING: [OrderStatus.PENDING],
	PAID: [OrderStatus.PENDING, OrderStatus.PAID],
	SHIPPED: [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.SHIPPED],
	DELIVERED: [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED],
	CANCELED: [OrderStatus.PENDING, OrderStatus.CANCELED],
	REFUNDED: [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.REFUNDED],
};

function pickWeighted<T>(entries: Array<[T, number]>): T {
	const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
	let roll = Math.random() * total;

	for (const [value, weight] of entries) {
		roll -= weight;
		if (roll <= 0) return value;
	}

	const [fallback] = entries;

	if (!fallback) throw new Error("weightedPick recebeu lista vazia.");

	return fallback[0];
}

function id(): string {
	return crypto.randomUUID();
}

function slugify(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

/** Data de pedido sorteada dentro da janela de histórico, com sazonalidade mensal. */
function buildOrderDates(count: number): Date[] {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth() - (MONTHS_OF_HISTORY - 1), 1);

	const months: Array<{ start: Date; days: number; weight: number }> = [];

	for (let offset = 0; offset < MONTHS_OF_HISTORY; offset++) {
		const monthStart = new Date(start.getFullYear(), start.getMonth() + offset, 1);
		const days = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
		// leve crescimento ao longo do tempo + sazonalidade do mês do calendário
		const growth = 1 + offset / MONTHS_OF_HISTORY / 1.5;

		months.push({
			start: monthStart,
			days,
			weight: (MONTH_WEIGHT[monthStart.getMonth()] ?? 1) * growth,
		});
	}

	const totalWeight = months.reduce((sum, month) => sum + month.weight, 0);
	const dates: Date[] = [];

	for (const month of months) {
		const monthOrders = Math.round((month.weight / totalWeight) * count);

		for (let index = 0; index < monthOrders; index++) {
			const day = faker.number.int({ min: 1, max: month.days });
			const date = new Date(month.start.getFullYear(), month.start.getMonth(), day);

			date.setHours(faker.number.int({ min: 7, max: 23 }), faker.number.int({ min: 0, max: 59 }));

			// não gera pedido no futuro
			if (date <= now) dates.push(date);
		}
	}

	return dates.sort((a, b) => a.getTime() - b.getTime());
}

async function insertChunked<T>(label: string, rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
	for (let index = 0; index < rows.length; index += CHUNK) {
		await insert(rows.slice(index, index + CHUNK));
	}

	console.log(`  ${label}: ${rows.length}`);
}

async function main() {
	console.log("Limpando tabelas do domínio...");
	await prisma.orderEvent.deleteMany();
	await prisma.orderItem.deleteMany();
	await prisma.order.deleteMany();
	await prisma.customer.deleteMany();
	await prisma.product.deleteMany();
	await prisma.category.deleteMany();
	await prisma.region.deleteMany();

	console.log("Inserindo...");

	const regions = REGIONS.map((region) => ({
		id: id(),
		name: region.name,
		code: region.code,
		country: "BR",
	}));
	await prisma.region.createMany({ data: regions });
	console.log(`  regions: ${regions.length}`);

	const categories = CATEGORIES.map((name) => ({ id: id(), name, slug: slugify(name) }));
	await prisma.category.createMany({ data: categories });
	console.log(`  categories: ${categories.length}`);

	const products = Array.from({ length: PRODUCT_COUNT }, (_, index) => {
		const cost = faker.number.float({ min: 12, max: 2400, fractionDigits: 2 });
		const margin = faker.number.float({ min: 1.25, max: 2.4, fractionDigits: 2 });

		return {
			id: id(),
			sku: `SKU-${String(index + 1).padStart(5, "0")}`,
			name: faker.commerce.productName(),
			categoryId: faker.helpers.arrayElement(categories).id,
			price: Number((cost * margin).toFixed(2)),
			cost,
			stockQuantity: faker.number.int({ min: 0, max: 900 }),
			isActive: faker.datatype.boolean({ probability: 0.92 }),
			createdAt: faker.date.past({ years: 3 }),
		};
	});
	await insertChunked("products", products, (chunk) => prisma.product.createMany({ data: chunk }));

	const signupStart = new Date();
	signupStart.setMonth(signupStart.getMonth() - (MONTHS_OF_HISTORY + 2));

	const customers = Array.from({ length: CUSTOMER_COUNT }, (_, index) => {
		const firstName = faker.person.firstName();
		const lastName = faker.person.lastName();

		return {
			id: id(),
			name: `${firstName} ${lastName}`,
			email: `${slugify(`${firstName}.${lastName}`)}.${index}@example.com`,
			regionId: faker.helpers.arrayElement(regions).id,
			signupDate: faker.date.between({ from: signupStart, to: new Date() }),
		};
	});
	await insertChunked("customers", customers, (chunk) => prisma.customer.createMany({ data: chunk }));

	// Produtos populares concentram vendas (cauda longa realista).
	const popularProducts = faker.helpers.arrayElements(products, Math.floor(PRODUCT_COUNT * 0.15));

	const orderDates = buildOrderDates(ORDER_COUNT);
	const orders: Array<{
		id: string;
		orderNumber: string;
		customerId: string;
		regionId: string;
		status: OrderStatus;
		channel: OrderChannel;
		shippingFee: number;
		placedAt: Date;
	}> = [];
	const orderItems: Array<{
		id: string;
		orderId: string;
		productId: string;
		quantity: number;
		unitPrice: number;
		discount: number;
	}> = [];
	const orderEvents: Array<{ id: string; orderId: string; status: OrderStatus; occurredAt: Date }> = [];

	for (const [index, placedAt] of orderDates.entries()) {
		const customer = faker.helpers.arrayElement(customers);
		const orderId = id();
		const status = pickWeighted(STATUS_WEIGHTS);

		orders.push({
			id: orderId,
			orderNumber: `PED-${String(index + 1).padStart(6, "0")}`,
			customerId: customer.id,
			// 92% dos pedidos vão para a região do cliente
			regionId: faker.datatype.boolean({ probability: 0.92 })
				? customer.regionId
				: faker.helpers.arrayElement(regions).id,
			status,
			channel: pickWeighted(CHANNEL_WEIGHTS),
			shippingFee: faker.number.float({ min: 0, max: 49.9, fractionDigits: 2 }),
			placedAt,
		});

		const itemCount = faker.helpers.weightedArrayElement([
			{ weight: 45, value: 1 },
			{ weight: 28, value: 2 },
			{ weight: 15, value: 3 },
			{ weight: 8, value: 4 },
			{ weight: 4, value: 5 },
		]);

		const chosen = new Set<string>();

		for (let item = 0; item < itemCount; item++) {
			const product = faker.datatype.boolean({ probability: 0.55 })
				? faker.helpers.arrayElement(popularProducts)
				: faker.helpers.arrayElement(products);

			if (chosen.has(product.id)) continue;
			chosen.add(product.id);

			const quantity = faker.helpers.weightedArrayElement([
				{ weight: 70, value: 1 },
				{ weight: 20, value: 2 },
				{ weight: 10, value: faker.number.int({ min: 3, max: 6 }) },
			]);
			const discount = faker.datatype.boolean({ probability: 0.22 })
				? Number((product.price * quantity * faker.number.float({ min: 0.05, max: 0.3 })).toFixed(2))
				: 0;

			orderItems.push({
				id: id(),
				orderId,
				productId: product.id,
				quantity,
				unitPrice: product.price,
				discount,
			});
		}

		let cursor = placedAt.getTime();

		for (const chainStatus of STATUS_CHAIN[status]) {
			orderEvents.push({ id: id(), orderId, status: chainStatus, occurredAt: new Date(cursor) });
			cursor += faker.number.int({ min: 2, max: 72 }) * 60 * 60 * 1000;
		}
	}

	await insertChunked("orders", orders, (chunk) => prisma.order.createMany({ data: chunk }));
	await insertChunked("orderItems", orderItems, (chunk) => prisma.orderItem.createMany({ data: chunk }));
	await insertChunked("orderEvents", orderEvents, (chunk) => prisma.orderEvent.createMany({ data: chunk }));

	console.log("Seed concluído.");
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
