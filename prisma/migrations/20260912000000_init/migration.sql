-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "projectUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCaseSet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "feature" TEXT NOT NULL,
    "description" TEXT,
    "userFlow" TEXT,
    "expectedResult" TEXT,
    "role" TEXT,
    "testedBy" TEXT,
    "count" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestCaseSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "testCaseSetId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "featureModule" TEXT NOT NULL,
    "testScenario" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "precondition" TEXT,
    "actionStep" TEXT NOT NULL,
    "testData" TEXT,
    "expectedResult" TEXT NOT NULL,
    "actualResult" TEXT,
    "testingResult" TEXT NOT NULL DEFAULT 'Not Tested',
    "testDate" TEXT,
    "testBy" TEXT,
    "bugNote" TEXT,
    "automationStatus" TEXT NOT NULL DEFAULT 'Not Automated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationScript" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "script" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Generated',
    "testCaseIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExcelFile" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sheets" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExcelFile_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TestCaseSet" ADD CONSTRAINT "TestCaseSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_testCaseSetId_fkey" FOREIGN KEY ("testCaseSetId") REFERENCES "TestCaseSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationScript" ADD CONSTRAINT "AutomationScript_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
