const express = require('express');
const winston = require('winston');
const dbConnection = require('../shared/db-connection');

const app = express();
const PORT = process.env.PORT || 3002;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'reporting-dashboard' });
});

app.get('/api/reports/sales', async (req, res) => {
  try {
    const pool = await dbConnection.getPool();
    const result = await pool.request()
      .query(`
        SELECT 
          YEAR(OrderDate) as Year,
          MONTH(OrderDate) as Month,
          COUNT(*) as OrderCount,
          SUM(TotalDue) as TotalSales
        FROM Sales.SalesOrderHeader
        GROUP BY YEAR(OrderDate), MONTH(OrderDate)
        ORDER BY Year DESC, Month DESC
      `);
    res.json(result.recordset);
  } catch (error) {
    logger.error('Error fetching sales report:', error);
    res.status(500).json({ error: 'Failed to fetch sales report' });
  }
});

app.get('/api/reports/products', async (req, res) => {
  try {
    const pool = await dbConnection.getPool();
    const result = await pool.request()
      .query(`
        SELECT TOP 10
          p.Name as ProductName,
          pc.Name as Category,
          SUM(sod.OrderQty) as TotalQuantity,
          SUM(sod.LineTotal) as TotalRevenue
        FROM Sales.SalesOrderDetail sod
        JOIN Production.Product p ON sod.ProductID = p.ProductID
        JOIN Production.ProductSubcategory ps ON p.ProductSubcategoryID = ps.ProductSubcategoryID
        JOIN Production.ProductCategory pc ON ps.ProductCategoryID = pc.ProductCategoryID
        GROUP BY p.Name, pc.Name
        ORDER BY TotalRevenue DESC
      `);
    res.json(result.recordset);
  } catch (error) {
    logger.error('Error fetching product report:', error);
    res.status(500).json({ error: 'Failed to fetch product report' });
  }
});

async function startServer() {
  try {
    await dbConnection.connect();
    app.listen(PORT, () => {
      logger.info(`Reporting Dashboard service listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();